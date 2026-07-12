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
import type { Translate } from '../../i18n'
import type { Data, Layout } from 'plotly.js-dist-min'

export interface RREHeatmapData {
  traces: Data[]
  layout: Partial<Layout>
}

/**
 * Generate RRE heatmap chart data
 */
export function getRREHeatmapData(tournaments: TournamentSummary[], t: Translate): RREHeatmapData {
  // Calculate data for each tournament
  const data = tournaments.map(tour => ({
    buyIn: getTournamentBuyIn(tour),
    rre: getTournamentRRE(tour),
    totalEntries: tour.totalPlayers,
    timeOfDay: getTournamentTimeOfWeek(tour)[1], // minutes of day
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
    name: t('chart.rre.legend.byBuyIn'),
    hovertemplate: t('chart.rre.hover.byBuyIn'),
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
    name: t('chart.rre.legend.byEntries'),
    hovertemplate: t('chart.rre.hover.byEntries'),
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
    name: t('chart.rre.legend.byTime'),
    hovertemplate: t('chart.rre.hover.byTime'),
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
    name: t('chart.rre.legend.marginal'),
    hovertemplate: t('chart.rre.hover.marginal'),
    xaxis: 'x4',
    yaxis: 'y',
  } as unknown as Data)

  const layout = {
    title: { text: t('chart.rre.title') },
    height: 500,
    grid: {
      rows: 1,
      columns: 4,
      pattern: 'independent',
    },
    // Column widths ratio 2:2:2:1 (matching Python version)
    xaxis: {
      title: { text: t('chart.rre.axis.log2BuyIn') },
      domain: [0, 0.27],
      fixedrange: true,
      zeroline: false,
    },
    xaxis2: {
      title: { text: t('chart.rre.axis.log2Entries') },
      domain: [0.29, 0.56],
      fixedrange: true,
      zeroline: false,
    },
    xaxis3: {
      title: { text: t('chart.rre.axis.timeOfDay') },
      domain: [0.58, 0.85],
      fixedrange: true,
      zeroline: false,
    },
    xaxis4: {
      title: { text: t('chart.rre.axis.marginal') },
      domain: [0.87, 1],
      fixedrange: true,
      zeroline: false,
    },
    yaxis: {
      title: { text: t('chart.rre.axis.log2Rre') },
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
      { x: 0, y: 0, xref: 'paper', yref: 'y', text: t('chart.rre.annotation.breakEven'), showarrow: false, xanchor: 'left', yanchor: 'bottom' },
      { x: 0, y: 2, xref: 'paper', yref: 'y', text: t('chart.rre.annotation.goodRun'), showarrow: false, xanchor: 'left', yanchor: 'bottom' },
      { x: 0, y: 5, xref: 'paper', yref: 'y', text: t('chart.rre.annotation.deepRun'), showarrow: false, xanchor: 'left', yanchor: 'bottom' },
    ],
  }

  return { traces, layout: layout as Partial<Layout> }
}
