/**
 * Async version of All-in Equity calculation
 * Uses Web Worker to run WASM off the main thread
 */

import type { Data, Layout } from 'plotly.js-dist-min'
import type { HandHistory, HandStage } from '../../types'
import {
  getHandHistoryAllInedStreet,
  getHandHistoryShowdownPlayers,
} from '../../types'
import type {
  EquityWorkerInput,
  EquityWorkerOutput,
} from '../../workers/equityWorker'

export interface AllInHandData {
  handId: string
  tournamentId: number | null
  allInStreet: HandStage
  equity: number
  actualResult: number
  communityAtAllIn: string[]
}

export interface AllInEquityData {
  traces: Data[]
  layout: Partial<Layout>
}

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

function getActualResult(h: HandHistory): number {
  const heroWon = h.wons.get('Hero') ?? 0
  const showdownPlayers = getHandHistoryShowdownPlayers(h)

  if (heroWon === 0) {
    return 0
  }

  const winners = Array.from(h.wons.entries())
    .filter(([pid, amount]) => showdownPlayers.has(pid) && amount > 0)

  const maxWin = Math.max(...winners.map(([, amount]) => amount))
  const numWinners = winners.filter(([, amount]) => amount === maxWin).length

  if (heroWon === maxWin) {
    return 1.0 / numWinners
  }

  return 0
}

interface EligibleHand {
  handId: string
  tournamentId: number | null
  allInStreet: HandStage
  heroCards: [string, string]
  opponents: string[][]
  communityAtAllIn: string[]
  actualResult: number
}

/**
 * Filter eligible hands (fast, runs on main thread)
 */
function filterEligibleHands(handHistories: HandHistory[]): EligibleHand[] {
  const eligible: EligibleHand[] = []

  for (const h of handHistories) {
    const allInStreet = getHandHistoryAllInedStreet(h, 'Hero')

    if (allInStreet !== 'preflop' && allInStreet !== 'flop' && allInStreet !== 'turn') {
      continue
    }

    const showdownPlayers = getHandHistoryShowdownPlayers(h)
    if (showdownPlayers.size < 2 || !showdownPlayers.has('Hero')) {
      continue
    }

    const heroCards = h.knownCards.get('Hero')
    if (!heroCards) continue

    const opponents: string[][] = []
    for (const playerId of showdownPlayers) {
      if (playerId === 'Hero') continue
      const cards = h.knownCards.get(playerId)
      if (cards) {
        opponents.push([cards[0], cards[1]])
      }
    }

    if (opponents.length === 0) continue

    const communityAtAllIn = getCommunityAtStreet(h, allInStreet)

    eligible.push({
      handId: h.id,
      tournamentId: h.tournamentId,
      allInStreet,
      heroCards: [heroCards[0], heroCards[1]],
      opponents,
      communityAtAllIn,
      actualResult: getActualResult(h),
    })
  }

  return eligible
}

/**
 * Calculate equity using multiple parallel Web Workers
 */
export async function collectAllInDataAsync(
  handHistories: HandHistory[],
  onProgress?: (current: number, total: number) => void
): Promise<{ data: AllInHandData[]; luckScore: number }> {
  // Filter eligible hands on main thread (fast)
  const eligible = filterEligibleHands(handHistories)

  if (eligible.length === 0) {
    return { data: [], luckScore: 0 }
  }

  // Determine number of workers (use available cores, max 8)
  const numWorkers = Math.min(
    navigator.hardwareConcurrency || 4,
    8,
    eligible.length // Don't spawn more workers than hands
  )

  onProgress?.(0, eligible.length)

  // Split hands across workers
  const chunksPerWorker = Math.ceil(eligible.length / numWorkers)
  const chunks: EligibleHand[][] = []
  for (let i = 0; i < numWorkers; i++) {
    const start = i * chunksPerWorker
    const end = Math.min(start + chunksPerWorker, eligible.length)
    if (start < eligible.length) {
      chunks.push(eligible.slice(start, end))
    }
  }

  // Track progress across all workers
  const progressPerWorker = new Array(chunks.length).fill(0)
  const updateProgress = () => {
    const total = progressPerWorker.reduce((a, b) => a + b, 0)
    onProgress?.(total, eligible.length)
  }

  // Track stats across all workers
  let totalCacheHits = 0
  let totalCacheMisses = 0
  let totalFullCalcs = 0

  // Spawn workers and collect results
  const workerPromises = chunks.map((chunk, workerIndex) => {
    return new Promise<AllInHandData[]>((resolve, reject) => {
      const worker = new Worker(
        new URL('../../workers/equityWorker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (event: MessageEvent<EquityWorkerOutput>) => {
        const msg = event.data

        if (msg.type === 'progress') {
          progressPerWorker[workerIndex] = msg.current
          updateProgress()
        } else if (msg.type === 'result') {
          worker.terminate()
          // Aggregate stats
          if (msg.stats) {
            totalCacheHits += msg.stats.cacheHits
            totalCacheMisses += msg.stats.cacheMisses
            totalFullCalcs += msg.stats.fullCalcs
          }
          resolve(msg.data.map(d => ({
            ...d,
            allInStreet: d.allInStreet as HandStage,
          })))
        } else if (msg.type === 'error') {
          worker.terminate()
          reject(new Error(msg.message))
        }
      }

      worker.onerror = (error) => {
        worker.terminate()
        reject(error)
      }

      worker.postMessage({
        type: 'calculate',
        hands: chunk,
      } as EquityWorkerInput)
    })
  })

  // Wait for all workers to complete
  const results = await Promise.all(workerPromises)
  const allData = results.flat()

  // Log aggregated cache stats
  console.log(`[Equity] All-in calculation complete:`, {
    totalHands: allData.length,
    cacheHits: totalCacheHits,
    cacheMisses: totalCacheMisses,
    fullCalcs: totalFullCalcs,
    workers: chunks.length,
  })

  // Calculate combined luck score
  const wasmModule = await import('../../wasm/pokercraft_wasm')
  await wasmModule.default()  // Initialize WASM
  const luckCalc = new wasmModule.LuckCalculator()
  for (const data of allData) {
    try {
      luckCalc.addResult(data.equity, data.actualResult)
    } catch {
      // Skip invalid
    }
  }
  let luckScore = 0
  try {
    luckScore = luckCalc.luckScore()
  } catch {
    // Failed
  }
  luckCalc.free()

  return { data: allData, luckScore }
}

/**
 * Create the chart from pre-computed all-in data
 */
export function createAllInEquityChart(
  allInData: AllInHandData[],
  luckScore: number
): AllInEquityData {
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

  // Create histogram bins
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
  const binRanges = Array.from({ length: bins }, (_, i) =>
    `${(i * binSize * 100).toFixed(1)}% ~ ${((i + 1) * binSize * 100).toFixed(1)}%`
  )

  const OPACITY_GREEN = 'rgba(52,203,59,0.8)'
  const OPACITY_YELLOW = 'rgba(204,198,53,0.8)'
  const OPACITY_RED = 'rgba(206,37,37,0.8)'

  const totalCounts = winCounts.map((w, i) => w + chopCounts[i] + loseCounts[i])
  const winPcts = winCounts.map((w, i) => totalCounts[i] > 0 ? w / totalCounts[i] : 0)
  const chopPcts = chopCounts.map((c, i) => totalCounts[i] > 0 ? c / totalCounts[i] : 0)
  const losePcts = loseCounts.map((l, i) => totalCounts[i] > 0 ? l / totalCounts[i] : 0)

  const traces: Data[] = [
    {
      type: 'bar',
      x: binCenters,
      y: winCounts,
      width: binWidths,
      customdata: binRanges,
      name: 'Hero Won',
      marker: { color: OPACITY_GREEN },
      hovertemplate: 'Equity: %{customdata}<br>Won: %{y}<extra></extra>',
      legendgroup: 'won',
    } as Data,
    {
      type: 'bar',
      x: binCenters,
      y: chopCounts,
      width: binWidths,
      customdata: binRanges,
      name: 'Chopped',
      marker: { color: OPACITY_YELLOW },
      hovertemplate: 'Equity: %{customdata}<br>Chopped: %{y}<extra></extra>',
      legendgroup: 'chop',
      base: winCounts,
    } as Data,
    {
      type: 'bar',
      x: binCenters,
      y: loseCounts,
      width: binWidths,
      customdata: binRanges,
      name: 'Hero Lost',
      marker: { color: OPACITY_RED },
      hovertemplate: 'Equity: %{customdata}<br>Lost: %{y}<extra></extra>',
      legendgroup: 'lost',
      base: winCounts.map((w, i) => w + chopCounts[i]),
    } as Data,
    {
      type: 'bar',
      x: binCenters,
      y: winPcts,
      width: binWidths,
      customdata: binRanges,
      name: 'Hero Won',
      marker: { color: OPACITY_GREEN },
      hovertemplate: 'Equity: %{customdata}<br>Win Rate: %{y:.2%}<extra></extra>',
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
      customdata: binRanges,
      name: 'Chopped',
      marker: { color: OPACITY_YELLOW },
      hovertemplate: 'Equity: %{customdata}<br>Chop Rate: %{y:.2%}<extra></extra>',
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
      customdata: binRanges,
      name: 'Hero Lost',
      marker: { color: OPACITY_RED },
      hovertemplate: 'Equity: %{customdata}<br>Loss Rate: %{y:.2%}<extra></extra>',
      legendgroup: 'lost',
      showlegend: false,
      xaxis: 'x2',
      yaxis: 'y2',
    } as Data,
  ]

  const luckPercentile = 100 * (1 - (1 / (1 + Math.exp(-luckScore * 1.7))))

  const layout: Partial<Layout> = {
    title: { text: 'All-in Equity Analysis' },
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
      domain: [0.58, 1],
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
      domain: [0, 0.42],
      anchor: 'x2',
    },
    legend: {
      orientation: 'h',
      xanchor: 'center',
      x: 0.5,
      yanchor: 'top',
      y: -0.15,
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
