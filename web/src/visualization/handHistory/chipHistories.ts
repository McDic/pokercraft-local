/**
 * Chip Histories Chart
 * Shows chip stack progression over hands for each tournament
 */

import type { Data, Layout } from 'plotly.js-dist-min'
import type { HandHistory } from '../../types'
import {
  generateSequences,
  generateChipHistory,
  getSequenceDisplayName,
} from '../../types'
import type { Translate } from '../../i18n'
import { yieldToBrowser } from '../../utils'

export interface ChipHistoriesData {
  traces: Data[]
  layout: Partial<Layout>
}

/**
 * Generate chip histories chart data (async for large datasets)
 */
export async function getChipHistoriesData(
  handHistories: HandHistory[],
  t: Translate,
  onProgress?: (current: number, total: number) => void
): Promise<ChipHistoriesData> {
  const sequences = generateSequences(handHistories)
  const traces: Data[] = []

  // Track statistics
  let maxHandLength = 1
  const diedAt: number[] = []
  const deathThresholds = [3 / 4, 3 / 5, 1 / 2, 2 / 5, 1 / 3, 1 / 4, 1 / 5, 1 / 8, 1 / 10]
  const deathThresholdCount: Map<number, number> = new Map(deathThresholds.map(t => [t, 0]))
  let totalTourneys = 0
  let processedCount = 0

  for (const seq of sequences) {
    if (seq.histories[0].tournamentId === null) continue

    totalTourneys++
    const chipHistoryRaw = generateChipHistory(seq)
    const initialChips = chipHistoryRaw[0]

    // Track death thresholds
    const maxChipsSoFar: number[] = []
    let runningMax = 0
    for (const chips of chipHistoryRaw) {
      runningMax = Math.max(runningMax, chips)
      maxChipsSoFar.push(runningMax)
    }

    // Precompute suffix maximums (max from position i to end) - O(n) instead of O(n²)
    const suffixMax: number[] = new Array(chipHistoryRaw.length)
    let suffixRunningMax = -Infinity
    for (let i = chipHistoryRaw.length - 1; i >= 0; i--) {
      suffixRunningMax = Math.max(suffixRunningMax, chipHistoryRaw[i])
      suffixMax[i] = suffixRunningMax
    }

    for (const threshold of deathThresholds) {
      let passedThreshold = true
      for (let i = 0; i < chipHistoryRaw.length; i++) {
        if (chipHistoryRaw[i] <= threshold * maxChipsSoFar[i]) {
          // Check if they ever recovered above this point (O(1) lookup)
          const futureMax = suffixMax[i]
          if (futureMax > chipHistoryRaw[i]) {
            passedThreshold = false
            break
          }
        }
      }
      if (passedThreshold) {
        deathThresholdCount.set(threshold, (deathThresholdCount.get(threshold) ?? 0) + 1)
      }
    }

    // Track when player died (busted)
    if (chipHistoryRaw[chipHistoryRaw.length - 1] <= 0) {
      diedAt.push(chipHistoryRaw.length)
    }

    // Remove trailing zeros for display
    const displayHistory = [...chipHistoryRaw]
    while (displayHistory.length > 1 && displayHistory[displayHistory.length - 1] === 0) {
      displayHistory.pop()
    }
    maxHandLength = Math.max(maxHandLength, displayHistory.length)

    // Normalize chip history relative to initial stack
    const normalizedHistory = displayHistory.map(chips => chips / initialChips)
    const xValues = normalizedHistory.map((_, i) => i + 1)

    traces.push({
      type: 'scatter',
      x: xValues,
      y: normalizedHistory,
      mode: 'lines',
      name: getSequenceDisplayName(seq, t),
      hovertemplate: t('chart.chipHistories.hover.stack'),
    } as Data)

    // Yield every 50 tournaments to keep UI responsive
    processedCount++
    if (processedCount % 50 === 0) {
      onProgress?.(processedCount, sequences.length)
      await yieldToBrowser()
    }
  }

  // Add danger line
  const dangerX: number[] = []
  const dangerY: number[] = []
  for (let x = 1; x <= maxHandLength; x++) {
    dangerX.push(x)
    dangerY.push(Math.max(Math.exp((x / 100) * Math.log(10)) * 0.014, 1 / 3))
  }

  traces.push({
    type: 'scatter',
    x: dangerX,
    y: dangerY,
    mode: 'lines',
    name: t('chart.chipHistories.legend.dangerLine'),
    line: { dash: 'dash', color: 'rgba(33,33,33,0.33)' },
    hoverinfo: 'skip',
  } as Data)

  // Died-at survival curve (continuous)
  // Survival at hand N = % of players who survived to ENTER hand N
  // If someone busts at hand X, they entered X alive but died, so survival drops at X+1
  // Extends to maxHandLength to include tournaments where player won (never busted)
  if (totalTourneys > 0) {
    // Count busts at each hand number
    const bustCounts = new Map<number, number>()
    for (const d of diedAt) {
      bustCounts.set(d, (bustCounts.get(d) ?? 0) + 1)
    }

    // Build continuous survival rate from hand 1 to maxHandLength
    const binPositions: number[] = []
    const survivalRates: number[] = []
    let cumBusts = 0

    for (let hand = 1; hand <= maxHandLength; hand++) {
      // Survival at hand N = 1 - (busts at hands 1..N-1) / total
      // cumBusts currently contains busts from hands 1 to hand-1
      binPositions.push(hand)
      survivalRates.push(1 - cumBusts / totalTourneys)
      // Add busts at this hand - they affect the NEXT hand's survival
      cumBusts += bustCounts.get(hand) ?? 0
    }

    traces.push({
      type: 'scatter',
      x: binPositions,
      y: survivalRates,
      mode: 'lines',
      name: t('chart.chipHistories.legend.survivalRate'),
      line: { color: 'rgba(38,210,87,0.9)', width: 2 },
      fill: 'tozeroy',
      fillcolor: 'rgba(38,210,87,0.3)',
      hovertemplate: t('chart.chipHistories.hover.survival'),
      xaxis: 'x2',
      yaxis: 'y2',
    } as Data)
  }

  // Death threshold bar
  if (totalTourneys > 0) {
    const sortedThresholds = [...deathThresholds].sort((a, b) => b - a)
    traces.push({
      type: 'bar',
      x: sortedThresholds.map(t => `${t.toFixed(2)}x`),
      y: sortedThresholds.map(t => (deathThresholdCount.get(t) ?? 0) / totalTourneys),
      name: t('chart.chipHistories.legend.deathThreshold'),
      marker: { color: 'rgba(222,118,177,0.9)' },
      hovertemplate: t('chart.chipHistories.hover.deathThreshold'),
      xaxis: 'x3',
      yaxis: 'y3',
    } as Data)
  }

  const avgDiedAt = diedAt.length > 0 ? diedAt.reduce((a, b) => a + b, 0) / diedAt.length : 0

  const layout: Partial<Layout> = {
    title: { text: t('chart.chipHistories.title') },
    height: 900,
    showlegend: false,
    grid: {
      rows: 2,
      columns: 2,
      pattern: 'independent',
      roworder: 'top to bottom',
    },
    xaxis: {
      title: { text: t('chart.chipHistories.axis.handNumber') },
      domain: [0, 1],
      anchor: 'y',
      range: [0, maxHandLength + 1],
    },
    yaxis: {
      title: { text: t('chart.chipHistories.axis.stack') },
      type: 'log',
      domain: [0.45, 1],
      anchor: 'x',
      range: [-2.25, 2],
    },
    xaxis2: {
      title: { text: t('chart.chipHistories.axis.handNumberBust') },
      domain: [0, 0.45],
      anchor: 'y2',
    },
    yaxis2: {
      title: { text: t('chart.chipHistories.axis.survivalRate') },
      tickformat: '.0%',
      domain: [0, 0.30],
      anchor: 'x2',
      range: [0, 1],
    },
    xaxis3: {
      title: { text: t('chart.chipHistories.axis.deathThreshold') },
      domain: [0.55, 1],
      anchor: 'y3',
    },
    yaxis3: {
      title: { text: t('chart.chipHistories.axis.dieRate') },
      tickformat: '.0%',
      domain: [0, 0.30],
      anchor: 'x3',
      range: [0, 1],
    },
    annotations: [
      {
        text: t('chart.chipHistories.annotation.avgBust', { hands: avgDiedAt.toFixed(1) }),
        xref: 'x2',
        yref: 'y2',
        x: avgDiedAt,
        y: 0.5,
        showarrow: false,
        xanchor: 'left',
        font: { color: 'rgba(12,17,166,0.7)' },
      },
      {
        text: t('chart.chipHistories.annotation.dangerLine'),
        xref: 'x',
        yref: 'y',
        x: Math.min(maxHandLength, 150),
        y: Math.log10(Math.max(Math.exp((Math.min(maxHandLength, 150) / 100) * Math.log(10)) * 0.014, 1 / 3)),
        showarrow: false,
        font: { color: 'rgba(33,33,33,0.33)', size: 24 },
        yanchor: 'top',
      },
    ],
    shapes: [
      // Average died-at line
      {
        type: 'line',
        xref: 'x2',
        x0: avgDiedAt,
        x1: avgDiedAt,
        yref: 'y2',
        y0: 0,
        y1: 1,
        line: { color: 'rgba(12,17,166,0.7)', dash: 'dash' },
      },
    ],
  }

  return { traces, layout }
}
