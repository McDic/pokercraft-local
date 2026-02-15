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

export interface ChipHistoriesData {
  traces: Data[]
  layout: Partial<Layout>
}

/**
 * Generate chip histories chart data
 */
export function getChipHistoriesData(handHistories: HandHistory[]): ChipHistoriesData {
  const sequences = generateSequences(handHistories)
  const traces: Data[] = []

  // Track statistics
  let maxHandLength = 1
  const diedAt: number[] = []
  const deathThresholds = [3 / 4, 3 / 5, 1 / 2, 2 / 5, 1 / 3, 1 / 4, 1 / 5, 1 / 8, 1 / 10]
  const deathThresholdCount: Map<number, number> = new Map(deathThresholds.map(t => [t, 0]))
  let totalTourneys = 0

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
      name: getSequenceDisplayName(seq),
      hovertemplate: 'Hand #%{x}<br>Stack: %{y:.2f}x initial<extra></extra>',
    } as Data)
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
    name: 'Danger Line',
    line: { dash: 'dash', color: 'rgba(33,33,33,0.33)' },
    hoverinfo: 'skip',
  } as Data)

  // Died-at histogram
  if (diedAt.length > 0 && totalTourneys > 0) {
    const histogramBins = new Map<number, number>()
    for (const d of diedAt) {
      histogramBins.set(d, (histogramBins.get(d) ?? 0) + 1)
    }

    const sortedBins = Array.from(histogramBins.entries()).sort((a, b) => a[0] - b[0])
    let cumSum = 0
    const survivalRates: number[] = []
    const binPositions: number[] = []

    for (const [bin, count] of sortedBins) {
      cumSum += count
      binPositions.push(bin)
      survivalRates.push(1 - (cumSum / totalTourneys))
    }

    traces.push({
      type: 'bar',
      x: binPositions,
      y: survivalRates,
      name: 'Survival Rate',
      marker: { color: 'rgba(38,210,87,0.9)' },
      hovertemplate: 'Hand #%{x}<br>Survival: %{y:.1%}<extra></extra>',
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
      name: 'Death Threshold Pass Rate',
      marker: { color: 'rgba(222,118,177,0.9)' },
      hovertemplate: '%{x}<br>Pass Rate: %{y:.1%}<extra></extra>',
      xaxis: 'x3',
      yaxis: 'y3',
    } as Data)
  }

  const avgDiedAt = diedAt.length > 0 ? diedAt.reduce((a, b) => a + b, 0) / diedAt.length : 0

  const layout: Partial<Layout> = {
    title: { text: 'Chip Histories' },
    height: 900,
    showlegend: false,
    grid: {
      rows: 2,
      columns: 2,
      pattern: 'independent',
      roworder: 'top to bottom',
    },
    xaxis: {
      title: { text: 'Hand Number' },
      domain: [0, 1],
      anchor: 'y',
      range: [0, maxHandLength + 1],
    },
    yaxis: {
      title: { text: 'Stack (x initial)' },
      type: 'log',
      domain: [0.4, 1],
      anchor: 'x',
      range: [-2.25, 2],
    },
    xaxis2: {
      title: { text: 'Hand Number (Bust)' },
      domain: [0, 0.45],
      anchor: 'y2',
    },
    yaxis2: {
      title: { text: 'Survival Rate' },
      tickformat: '.0%',
      domain: [0, 0.32],
      anchor: 'x2',
      range: [0, 1],
    },
    xaxis3: {
      title: { text: 'Death Threshold' },
      domain: [0.55, 1],
      anchor: 'y3',
    },
    yaxis3: {
      title: { text: 'Pass Rate' },
      tickformat: '.0%',
      domain: [0, 0.32],
      anchor: 'x3',
      range: [0, 1],
    },
    annotations: [
      {
        text: `Avg Bust: ${avgDiedAt.toFixed(1)} hands`,
        xref: 'x2',
        yref: 'y2',
        x: avgDiedAt,
        y: 0.5,
        showarrow: true,
        arrowhead: 2,
        font: { color: 'rgba(12,17,166,0.7)' },
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
