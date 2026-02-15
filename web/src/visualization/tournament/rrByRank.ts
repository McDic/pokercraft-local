/**
 * RR by Rank Percentile Chart
 * Shows relative return vs rank percentile with regression line
 */

import type { TournamentSummary } from '../../types'
import { getTournamentRRs } from '../../types'
import { log2OrNaN, log10OrNaN, linearRegression } from '../../analytics'
import type { Data, Layout } from 'plotly.js-dist-min'

export interface RRByRankData {
  traces: Data[]
  layout: Partial<Layout>
}

/**
 * Generate RR by Rank chart data
 */
export function getRRByRankData(tournaments: TournamentSummary[]): RRByRankData {
  // Calculate data for each tournament
  const data = tournaments
    .map(t => {
      const rrs = getTournamentRRs(t)
      const rr = rrs.length > 0 ? rrs[rrs.length - 1] + 1.0 : NaN // Convert back to RR (not relative)
      return {
        name: `${t.name} (${t.startTime.toISOString().slice(0, 10).replace(/-/g, '')})`,
        rank: t.myRank,
        totalPlayers: t.totalPlayers,
        rankPercentile: t.myRank / t.totalPlayers,
        rr,
        peRR: (t.myRank / t.totalPlayers) * rr, // Percentile * RR
      }
    })
    .filter(d => d.rr > 0 && !isNaN(d.rr))

  const rankPercentiles = data.map(d => d.rankPercentile)
  const rrValues = data.map(d => d.rr)
  const peRRValues = data.map(d => d.peRR)

  // Linear regression on top 12.5% (rank <= 1/8)
  const topData = data.filter(d => d.rankPercentile <= 1 / 8)
  const topLog2Percentiles = topData.map(d => log2OrNaN(d.rankPercentile))
  const topLog2RR = topData.map(d => log2OrNaN(d.rr))

  const regression = linearRegression(topLog2Percentiles, topLog2RR)

  // Generate fitted line points
  const fittedX: number[] = []
  const fittedY: number[] = []
  if (!isNaN(regression.slope)) {
    // Find min without spread (more efficient for large arrays)
    let minLog2 = Infinity
    for (const x of topLog2Percentiles) {
      if (!isNaN(x) && x < minLog2) minLog2 = x
    }
    const maxLog2 = Math.log2(1 / 8)
    for (let log2X = minLog2; log2X <= maxLog2; log2X += 0.1) {
      fittedX.push(Math.pow(2, log2X))
      fittedY.push(Math.pow(2, regression.predict(log2X)))
    }
  }

  // Calculate min/max without spread (efficient single pass)
  let maxRR = -Infinity
  let minPercentile = Infinity
  for (let i = 0; i < rrValues.length; i++) {
    if (rrValues[i] > maxRR) maxRR = rrValues[i]
    if (rankPercentiles[i] < minPercentile) minPercentile = rankPercentiles[i]
  }

  const traces: Data[] = [
    // Main scatter: RR by percentile
    {
      type: 'scatter',
      x: rankPercentiles,
      y: rrValues,
      mode: 'markers',
      name: 'RR by Percentile',
      customdata: data.map(d => [d.name, d.totalPlayers, d.rank, d.rr, d.peRR]),
      hovertemplate:
        '%{customdata[0]}<br>' +
        'Rank: %{customdata[2]}/%{customdata[1]}<br>' +
        'RR: %{customdata[3]:.2f}<br>' +
        'PERR: %{customdata[4]:.4f}<extra></extra>',
    } as Data,
    // Secondary scatter: PERR (on secondary y-axis)
    {
      type: 'scatter',
      x: rankPercentiles,
      y: peRRValues,
      mode: 'markers',
      name: 'PERR (Percentile × RR)',
      visible: 'legendonly',
      marker: { color: '#BB75FF' },
      customdata: data.map(d => [d.name, d.totalPlayers, d.rank, d.rr, d.peRR]),
      hovertemplate:
        '%{customdata[0]}<br>' +
        'PERR: %{customdata[4]:.4f}<extra></extra>',
      yaxis: 'y2',
    } as Data,
    // Regression line
    {
      type: 'scatter',
      x: fittedX,
      y: fittedY,
      mode: 'lines',
      name: 'RR Trendline (top 12.5%)',
      line: { color: 'rgba(54,234,201,0.4)' },
      hoverinfo: 'skip',
    } as Data,
  ]

  const layout: Partial<Layout> = {
    title: { text: 'RR by Rank Percentile' },
    height: 500,
    xaxis: {
      title: { text: 'Rank Percentile' },
      type: 'log',
      tickformat: ',.0%',
      range: [0, log10OrNaN(minPercentile) - 0.2],
      autorange: false,
    },
    yaxis: {
      title: { text: 'RR' },
      type: 'log',
      range: [-1, log10OrNaN(Math.max(maxRR, 1)) + 0.1],
      autorange: false,
    },
    yaxis2: {
      title: { text: 'PERR' },
      type: 'log',
      overlaying: 'y',
      side: 'right',
      range: [log10OrNaN(0.01), log10OrNaN(0.75)],
      autorange: false,
    },
    legend: {
      orientation: 'h',
      xanchor: 'center',
      x: 0.5,
      yanchor: 'top',
      y: -0.2,
    },
    shapes: [
      // Break-even horizontal line (RR = 1)
      {
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 1,
        yref: 'y',
        y0: 1,
        y1: 1,
        line: { color: 'rgba(255,0,0,0.3)', dash: 'dash' },
      },
      // ITM cutoff vertical line (12.5%)
      {
        type: 'line',
        xref: 'x',
        x0: 1 / 8,
        x1: 1 / 8,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: { color: 'rgba(74,131,78,0.7)', dash: 'dash' },
      },
      // 100% vertical line
      {
        type: 'line',
        xref: 'x',
        x0: 1,
        x1: 1,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: { color: 'rgb(180,180,180)', dash: 'dash' },
      },
    ],
    annotations: [
      {
        text: '<b>Break-even</b>',
        xref: 'paper',
        x: 1,
        xanchor: 'right',
        yref: 'y',
        y: Math.log10(1), // log10(1) = 0 for RR = 1 on log scale
        yanchor: 'bottom',
        showarrow: false,
        font: { color: 'rgba(255,0,0,0.5)', size: 14 },
      },
      {
        text: 'Rough ITM Cut (~12.5%)',
        xref: 'x',
        x: 1 / 8,
        yref: 'paper',
        y: 0.98,
        showarrow: false,
        xanchor: 'right',
        font: { color: 'rgba(74,131,78,0.9)', size: 12 },
      },
    ],
  }

  return { traces, layout }
}
