/**
 * All-in Equity Histogram Chart
 * Shows equity distribution and luck analysis for all-in situations
 */

import type { Data, Layout } from 'plotly.js-dist-min'
import type { HandHistory, HandStage } from '../../types'
import {
  getHandHistoryAllInedStreet,
  getHandHistoryShowdownPlayers,
} from '../../types'
import { EquityResult, LuckCalculator } from '../../wasm/pokercraft_wasm'

export interface AllInHandData {
  handId: string
  tournamentId: number | null
  allInStreet: HandStage
  equity: number
  actualResult: number // 1.0 = won, 0.5 = chopped 2-way, 0 = lost
  communityAtAllIn: string[]
}

export interface AllInEquityData {
  traces: Data[]
  layout: Partial<Layout>
}

/**
 * Get community cards available at a given street
 */
function getCommunityAtStreet(h: HandHistory, street: HandStage): string[] {
  switch (street) {
    case 'preflop':
      return []
    case 'flop':
      return h.communityCards.slice(0, 3)
    case 'turn':
      return h.communityCards.slice(0, 4)
    case 'river':
      return h.communityCards.slice(0, 5)
  }
}

/**
 * Check if Hero won at showdown based on winnings
 */
function getActualResult(h: HandHistory): number {
  const heroWon = h.wons.get('Hero') ?? 0
  const showdownPlayers = getHandHistoryShowdownPlayers(h)

  if (heroWon === 0) {
    return 0
  }

  // Count how many players won (for chop detection)
  const winners = Array.from(h.wons.entries())
    .filter(([pid, amount]) => showdownPlayers.has(pid) && amount > 0)

  const maxWin = Math.max(...winners.map(([, amount]) => amount))
  const numWinners = winners.filter(([, amount]) => amount === maxWin).length

  if (heroWon === maxWin) {
    return 1.0 / numWinners // 1.0 for sole winner, 0.5 for 2-way chop, etc.
  }

  return 0
}

/**
 * Collect all-in hand data with equity calculations
 */
export function collectAllInData(handHistories: HandHistory[]): AllInHandData[] {
  const result: AllInHandData[] = []

  for (const h of handHistories) {
    const allInStreet = getHandHistoryAllInedStreet(h, 'Hero')

    // Only include preflop, flop, turn all-ins
    if (allInStreet !== 'preflop' && allInStreet !== 'flop' && allInStreet !== 'turn') {
      continue
    }

    const showdownPlayers = getHandHistoryShowdownPlayers(h)
    if (showdownPlayers.size < 2 || !showdownPlayers.has('Hero')) {
      continue
    }

    // Get Hero's cards
    const heroCards = h.knownCards.get('Hero')
    if (!heroCards) continue

    // Get opponent cards (only those who reached showdown and have known cards)
    const opponents: string[][] = []
    for (const playerId of showdownPlayers) {
      if (playerId === 'Hero') continue
      const cards = h.knownCards.get(playerId)
      if (cards) {
        opponents.push([cards[0], cards[1]])
      }
    }

    // Need at least one opponent with known cards
    if (opponents.length === 0) continue

    // Calculate equity at the moment of all-in
    const communityAtAllIn = getCommunityAtStreet(h, allInStreet)
    const hands = [[heroCards[0], heroCards[1]], ...opponents]

    try {
      const equityResult = new EquityResult(hands, communityAtAllIn)
      const equity = equityResult.getEquity(0) // Hero is index 0
      equityResult.free()

      const actualResult = getActualResult(h)

      result.push({
        handId: h.id,
        tournamentId: h.tournamentId,
        allInStreet,
        equity,
        actualResult,
        communityAtAllIn,
      })
    } catch {
      // Equity calculation failed, skip this hand
    }
  }

  return result
}

/**
 * Generate all-in equity histogram data with luck score
 */
export function getAllInEquityData(handHistories: HandHistory[]): AllInEquityData {
  const allInData = collectAllInData(handHistories)

  if (allInData.length === 0) {
    return {
      traces: [],
      layout: {
        title: { text: 'All-in Equity Analysis' },
        annotations: [
          {
            text: 'No all-in hands found with known opponent cards',
            xref: 'paper',
            yref: 'paper',
            x: 0.5,
            y: 0.5,
            showarrow: false,
            font: { size: 16 },
          },
        ],
      },
    }
  }

  // Calculate luck score
  const luckCalc = new LuckCalculator()
  for (const data of allInData) {
    try {
      luckCalc.addResult(data.equity, data.actualResult)
    } catch {
      // Skip invalid results
    }
  }

  let luckScore = 0
  try {
    luckScore = luckCalc.luckScore()
  } catch {
    // Luck calculation failed
  }
  luckCalc.free()

  // Create histogram bins (0-5%, 5-10%, ..., 95-100%)
  const bins = 20
  const binSize = 1.0 / bins
  const winCounts = new Array(bins).fill(0)
  const chopCounts = new Array(bins).fill(0)
  const loseCounts = new Array(bins).fill(0)

  for (const data of allInData) {
    const binIndex = Math.min(Math.floor(data.equity / binSize), bins - 1)
    if (data.actualResult >= 0.99) {
      winCounts[binIndex]++
    } else if (data.actualResult > 0.01) {
      chopCounts[binIndex]++
    } else {
      loseCounts[binIndex]++
    }
  }

  const binCenters = Array.from({ length: bins }, (_, i) => (i + 0.5) * binSize)
  const binWidths = Array.from({ length: bins }, () => binSize * 0.9)

  const OPACITY_GREEN = 'rgba(52,203,59,0.8)'
  const OPACITY_YELLOW = 'rgba(204,198,53,0.8)'
  const OPACITY_RED = 'rgba(206,37,37,0.8)'

  // Calculate totals for percentage subplot
  const totalCounts = winCounts.map((w, i) => w + chopCounts[i] + loseCounts[i])
  const winPcts = winCounts.map((w, i) => totalCounts[i] > 0 ? w / totalCounts[i] : 0)
  const chopPcts = chopCounts.map((c, i) => totalCounts[i] > 0 ? c / totalCounts[i] : 0)
  const losePcts = loseCounts.map((l, i) => totalCounts[i] > 0 ? l / totalCounts[i] : 0)

  const traces: Data[] = [
    // Row 1: Count histogram
    {
      type: 'bar',
      x: binCenters,
      y: winCounts,
      width: binWidths,
      name: 'Hero Won',
      marker: { color: OPACITY_GREEN },
      hovertemplate: 'Equity: %{x:.0%}<br>Won: %{y}<extra></extra>',
      legendgroup: 'won',
    } as Data,
    {
      type: 'bar',
      x: binCenters,
      y: chopCounts,
      width: binWidths,
      name: 'Chopped',
      marker: { color: OPACITY_YELLOW },
      hovertemplate: 'Equity: %{x:.0%}<br>Chopped: %{y}<extra></extra>',
      legendgroup: 'chop',
      base: winCounts,
    } as Data,
    {
      type: 'bar',
      x: binCenters,
      y: loseCounts,
      width: binWidths,
      name: 'Hero Lost',
      marker: { color: OPACITY_RED },
      hovertemplate: 'Equity: %{x:.0%}<br>Lost: %{y}<extra></extra>',
      legendgroup: 'lost',
      base: winCounts.map((w, i) => w + chopCounts[i]),
    } as Data,

    // Row 2: Percentage histogram
    {
      type: 'bar',
      x: binCenters,
      y: winPcts,
      width: binWidths,
      name: 'Hero Won',
      marker: { color: OPACITY_GREEN },
      hovertemplate: 'Equity: %{x:.0%}<br>Win Rate: %{y:.0%}<extra></extra>',
      legendgroup: 'won',
      showlegend: false,
      xaxis: 'x2',
      yaxis: 'y2',
      base: losePcts.map((l, i) => l + chopPcts[i]),
    } as Data,
    {
      type: 'bar',
      x: binCenters,
      y: chopPcts,
      width: binWidths,
      name: 'Chopped',
      marker: { color: OPACITY_YELLOW },
      hovertemplate: 'Equity: %{x:.0%}<br>Chop Rate: %{y:.0%}<extra></extra>',
      legendgroup: 'chop',
      showlegend: false,
      xaxis: 'x2',
      yaxis: 'y2',
      base: losePcts,
    } as Data,
    {
      type: 'bar',
      x: binCenters,
      y: losePcts,
      width: binWidths,
      name: 'Hero Lost',
      marker: { color: OPACITY_RED },
      hovertemplate: 'Equity: %{x:.0%}<br>Loss Rate: %{y:.0%}<extra></extra>',
      legendgroup: 'lost',
      showlegend: false,
      xaxis: 'x2',
      yaxis: 'y2',
    } as Data,
  ]

  // Calculate luck percentile
  const luckPercentile = 100 * (1 - (1 / (1 + Math.exp(-luckScore * 1.7)))) // Approximate normal CDF

  const layout: Partial<Layout> = {
    title: {
      text: 'All-in Equity Analysis',
    },
    height: 700,
    barmode: 'stack',
    grid: {
      rows: 2,
      columns: 1,
      pattern: 'independent',
    },
    xaxis: {
      title: { text: 'Hero Equity at All-in' },
      tickformat: '.0%',
      range: [0, 1],
      domain: [0, 1],
      anchor: 'y',
    },
    yaxis: {
      title: { text: 'Count' },
      domain: [0.55, 1],
      anchor: 'x',
    },
    xaxis2: {
      title: { text: 'Hero Equity at All-in' },
      tickformat: '.0%',
      range: [0, 1],
      domain: [0, 1],
      anchor: 'y2',
    },
    yaxis2: {
      title: { text: 'Win/Chop/Loss Rate' },
      tickformat: '.0%',
      range: [0, 1],
      domain: [0, 0.45],
      anchor: 'x2',
    },
    legend: {
      orientation: 'h',
      xanchor: 'center',
      x: 0.5,
      yanchor: 'top',
      y: -0.08,
    },
    annotations: [
      {
        text: `${allInData.length} all-ins | Luck Score: ${luckScore.toFixed(2)} (${luckPercentile.toFixed(1)}th percentile)`,
        xref: 'paper',
        yref: 'paper',
        x: 0.5,
        y: 1.06,
        showarrow: false,
        font: { size: 14 },
      },
    ],
    shapes: [
      // Expected value line (diagonal) on percentage chart
      {
        type: 'line',
        xref: 'x2',
        x0: 0,
        x1: 1,
        yref: 'y2',
        y0: 1,
        y1: 0,
        line: { color: 'rgba(0,0,0,0.25)', dash: 'dash' },
      },
    ],
  }

  return { traces, layout }
}
