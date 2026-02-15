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

  // Shared colorscale (white to black)
  const colorscale: [number, string][] = [
    [0, 'rgba(255, 255, 255, 0.6)'],
    [1, 'rgba(0, 0, 0, 0.6)'],
  ]

  // Common histogram2d options
  const commonOptions = {
    ybins: { size: 0.5, start: -3 },
    histfunc: 'sum' as const,
    coloraxis: 'coloraxis',
  }

  const traces: Data[] = []

  // Histogram2d: RRE by Buy-In
  traces.push({
    type: 'histogram2d',
    x: log2BuyIn,
    y: log2RRE,
    z: rreValues,
    name: 'RRE by Buy-In',
    hovertemplate: 'Log2(RRE) = [%{y}]<br>Log2(Buy-In) = [%{x}]<br>Sum RRE: %{z:.3f}<extra></extra>',
    xaxis: 'x',
    yaxis: 'y',
    ...commonOptions,
  } as unknown as Data)

  // Histogram2d: RRE by Total Entries
  traces.push({
    type: 'histogram2d',
    x: log2Entries,
    y: log2RRE,
    z: rreValues,
    xbins: { start: 1.0, size: 1.0 },
    name: 'RRE by Entries',
    hovertemplate: 'Log2(RRE) = [%{y}]<br>Log2(Entries) = [%{x}]<br>Sum RRE: %{z:.3f}<extra></extra>',
    xaxis: 'x2',
    yaxis: 'y',
    ...commonOptions,
  } as unknown as Data)

  // Histogram2d: RRE by Time of Day
  traces.push({
    type: 'histogram2d',
    x: timeOfDay,
    y: log2RRE,
    z: rreValues,
    xbins: { start: 0.0, size: 120, end: 1440 }, // 2-hour bins, 24 hours
    name: 'RRE by Time',
    hovertemplate: 'Log2(RRE) = [%{y}]<br>Time = [%{x}] mins<br>Sum RRE: %{z:.3f}<extra></extra>',
    xaxis: 'x3',
    yaxis: 'y',
    ...commonOptions,
  } as unknown as Data)

  // Marginal histogram
  traces.push({
    type: 'histogram',
    x: rreValues,
    y: log2RRE,
    histfunc: 'sum',
    orientation: 'h',
    ybins: { size: 0.5, start: -3 },
    marker: { color: 'rgba(70,70,70,0.35)' },
    name: 'Marginal RRE',
    hovertemplate: 'Log2(RRE) = [%{y}]<br>Sum RRE: %{x:.3f}<extra></extra>',
    xaxis: 'x4',
    yaxis: 'y',
  } as unknown as Data)

  const layout = {
    title: { text: 'RRE (Relative Return of Entry) Distribution' },
    height: 500,
    grid: {
      rows: 1,
      columns: 4,
      pattern: 'independent',
    },
    // Column widths ratio 2:2:2:1 (matching Python version)
    xaxis: {
      title: { text: 'Log2(Buy-In)' },
      domain: [0, 0.27],
      fixedrange: true,
      zeroline: false,
    },
    xaxis2: {
      title: { text: 'Log2(Entries)' },
      domain: [0.29, 0.56],
      fixedrange: true,
      zeroline: false,
    },
    xaxis3: {
      title: { text: 'Time of Day (mins)' },
      domain: [0.58, 0.85],
      fixedrange: true,
      zeroline: false,
    },
    xaxis4: {
      title: { text: 'Marginal' },
      domain: [0.87, 1],
      fixedrange: true,
      zeroline: false,
    },
    yaxis: {
      title: { text: 'Log2(RRE)' },
      fixedrange: true,
    },
    coloraxis: {
      colorscale: colorscale,
    },
    shapes: [
      // Vertical dividers between heatmaps
      {
        type: 'line',
        xref: 'paper',
        x0: 0.28,
        x1: 0.28,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: { color: 'rgba(0,0,0,0.3)', width: 1 },
      },
      {
        type: 'line',
        xref: 'paper',
        x0: 0.57,
        x1: 0.57,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: { color: 'rgba(0,0,0,0.3)', width: 1 },
      },
      {
        type: 'line',
        xref: 'paper',
        x0: 0.86,
        x1: 0.86,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: { color: 'rgba(0,0,0,0.3)', width: 1 },
      },
      // Break-even line (Log2(1) = 0)
      {
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 0.85,
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
        x1: 0.85,
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
        x1: 0.85,
        yref: 'y',
        y0: 5,
        y1: 5,
        line: { color: 'rgb(40,40,40)', dash: 'dash' },
      },
    ],
    annotations: [
      { x: 0, y: 0, xref: 'paper', yref: 'y', text: 'Break-even', showarrow: false, xanchor: 'left', yanchor: 'bottom' },
      { x: 0, y: 2, xref: 'paper', yref: 'y', text: 'Good run (4x)', showarrow: false, xanchor: 'left', yanchor: 'bottom' },
      { x: 0, y: 5, xref: 'paper', yref: 'y', text: 'Deep run (32x)', showarrow: false, xanchor: 'left', yanchor: 'bottom' },
    ],
  }

  return { traces, layout: layout as Partial<Layout> }
}
