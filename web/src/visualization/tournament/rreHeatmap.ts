/**
 * RRE Heatmap Chart
 * Shows RRE (Relative Return of Entry) distributions by buy-in, entries, and time of day
 */

import type { TournamentSummary } from '../../types'
import {
  getTournamentBuyIn,
  getTournamentRRE,
  getTournamentTimeOfWeek,
} from '../../types'
import { log2OrNaN } from '../../analytics'
import type { Data, Layout } from 'plotly.js-dist-min'

export interface RREHeatmapData {
  traces: Data[]
  layout: Partial<Layout>
}

/**
 * Generate RRE heatmap chart data
 */
export function getRREHeatmapData(tournaments: TournamentSummary[]): RREHeatmapData {
  // Calculate data for each tournament
  const data = tournaments.map(t => ({
    buyIn: getTournamentBuyIn(t),
    rre: getTournamentRRE(t),
    totalEntries: t.totalPlayers,
    timeOfDay: getTournamentTimeOfWeek(t)[1], // minutes of day
  }))

  const log2RRE = data.map(d => log2OrNaN(d.rre))
  const log2BuyIn = data.map(d => log2OrNaN(d.buyIn))
  const log2Entries = data.map(d => log2OrNaN(d.totalEntries))
  const timeOfDay = data.map(d => d.timeOfDay)
  const rreValues = data.map(d => d.rre)

  const traces: Data[] = []

  // Histogram2d: RRE by Buy-In (use scatter for simplicity)
  traces.push({
    type: 'scatter',
    x: log2BuyIn,
    y: log2RRE,
    mode: 'markers',
    marker: {
      size: 8,
      color: rreValues,
      colorscale: [[0, 'rgba(255,255,255,0.6)'], [1, 'rgba(0,0,0,0.6)']],
    },
    name: 'RRE by Buy-In',
    hovertemplate: 'Log2(RRE) = %{y:.2f}<br>Log2(Buy-In) = %{x:.2f}<br>RRE: %{marker.color:.3f}<extra></extra>',
    xaxis: 'x',
    yaxis: 'y',
  } as Data)

  // Histogram2d: RRE by Total Entries
  traces.push({
    type: 'scatter',
    x: log2Entries,
    y: log2RRE,
    mode: 'markers',
    marker: {
      size: 8,
      color: rreValues,
      colorscale: [[0, 'rgba(255,255,255,0.6)'], [1, 'rgba(0,0,0,0.6)']],
    },
    name: 'RRE by Entries',
    hovertemplate: 'Log2(RRE) = %{y:.2f}<br>Log2(Entries) = %{x:.2f}<br>RRE: %{marker.color:.3f}<extra></extra>',
    xaxis: 'x2',
    yaxis: 'y',
  } as Data)

  // Histogram2d: RRE by Time of Day
  traces.push({
    type: 'scatter',
    x: timeOfDay,
    y: log2RRE,
    mode: 'markers',
    marker: {
      size: 8,
      color: rreValues,
      colorscale: [[0, 'rgba(255,255,255,0.6)'], [1, 'rgba(0,0,0,0.6)']],
    },
    name: 'RRE by Time',
    hovertemplate: 'Log2(RRE) = %{y:.2f}<br>Time = %{x} mins<br>RRE: %{marker.color:.3f}<extra></extra>',
    xaxis: 'x3',
    yaxis: 'y',
  } as Data)

  // Marginal histogram
  traces.push({
    type: 'histogram',
    y: log2RRE,
    orientation: 'h',
    marker: { color: 'rgba(70,70,70,0.35)' },
    name: 'Marginal RRE',
    xaxis: 'x4',
    yaxis: 'y',
  } as Data)

  const layout: Partial<Layout> = {
    title: { text: 'RRE (Relative Return of Entry) Distribution' },
    height: 500,
    grid: {
      rows: 1,
      columns: 4,
      pattern: 'independent',
    },
    xaxis: {
      title: { text: 'Log2(Buy-In)' },
      domain: [0, 0.22],
    },
    xaxis2: {
      title: { text: 'Log2(Entries)' },
      domain: [0.26, 0.48],
    },
    xaxis3: {
      title: { text: 'Time of Day (mins)' },
      domain: [0.52, 0.74],
    },
    xaxis4: {
      title: { text: 'Marginal' },
      domain: [0.78, 1],
    },
    yaxis: {
      title: { text: 'Log2(RRE)' },
    },
    shapes: [
      // Break-even line (Log2(1) = 0)
      {
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 0.74,
        yref: 'y',
        y0: 0,
        y1: 0,
        line: { color: 'rgb(140,140,140)', dash: 'dash' },
      },
      // Good run line (Log2(4) = 2)
      {
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 0.74,
        yref: 'y',
        y0: 2,
        y1: 2,
        line: { color: 'rgb(90,90,90)', dash: 'dash' },
      },
      // Deep run line (Log2(32) = 5)
      {
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 0.74,
        yref: 'y',
        y0: 5,
        y1: 5,
        line: { color: 'rgb(40,40,40)', dash: 'dash' },
      },
    ],
    annotations: [
      { x: 0, y: 0, xref: 'paper', yref: 'y', text: 'Break-even', showarrow: false, xanchor: 'left' },
      { x: 0, y: 2, xref: 'paper', yref: 'y', text: 'Good run (4x)', showarrow: false, xanchor: 'left' },
      { x: 0, y: 5, xref: 'paper', yref: 'y', text: 'Deep run (32x)', showarrow: false, xanchor: 'left' },
    ],
  }

  return { traces, layout }
}
