/**
 * RR by Rank Percentile Chart
 * Shows relative return vs rank percentile with regression line
 */

import type { TournamentSummary } from '../../types'
import { getTournamentRRs } from '../../types'
import { log2OrNaN, log10OrNaN, linearRegression } from '../../analytics'
import type { Translate } from '../../i18n'
import type { Data, Layout } from 'plotly.js-dist-min'

export interface RRByRankData {
  traces: Data[]
  layout: Partial<Layout>
}

/**
 * Generate RR by Rank chart data
 */
export function getRRByRankData(tournaments: TournamentSummary[], t: Translate): RRByRankData {
  // Calculate data for each tournament
  const data = tournaments
    .map(tour => {
      const rrs = getTournamentRRs(tour)
      const rr = rrs.length > 0 ? rrs[rrs.length - 1] + 1.0 : NaN // Convert back to RR (not relative)
      return {
        name: `${tour.name} (${tour.startTime.toISOString().slice(0, 10).replace(/-/g, '')})`,
        rank: tour.myRank,
        totalPlayers: tour.totalPlayers,
        rankPercentile: tour.myRank / tour.totalPlayers,
        rr,
        peRR: (tour.myRank / tour.totalPlayers) * rr, // Percentile * RR
      }
    })
    // Every axis bound, and every plotted point, is derived from what survives here — so
    // this filter is where non-finite values have to be stopped. `rankPercentile` is
    // `myRank / totalPlayers`, which a zero field would make Infinity or NaN, and that
    // then reaches `minPercentile`, the x-axis range, `customdata`, and the export.
    .filter(
      d => d.rr > 0 && !isNaN(d.rr) && d.rankPercentile > 0 && Number.isFinite(d.rankPercentile)
    )

  // Every axis bound below is computed from this data, so with none of it `minPercentile`
  // stays Infinity and the x-axis range becomes [0, Infinity] — which Plotly cannot use,
  // and which `JSON.stringify` turns into [0, null] on the way into the HTML export.
  // A player who has never cashed sees this: the filter above keeps only paying finishes.
  if (data.length === 0) {
    return {
      traces: [],
      layout: {
        title: { text: t('chart.rrByRank.title') },
        height: 500,
        annotations: [
          {
            text: t('chart.rrByRank.noData'),
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
      name: t('chart.rrByRank.legend.rrByPercentile'),
      customdata: data.map(d => [d.name, d.totalPlayers, d.rank, d.rr, d.peRR]),
      hovertemplate: t('chart.rrByRank.hover.rr'),
    } as Data,
    // Secondary scatter: PERR (on secondary y-axis)
    {
      type: 'scatter',
      x: rankPercentiles,
      y: peRRValues,
      mode: 'markers',
      name: t('chart.rrByRank.legend.perr'),
      visible: 'legendonly',
      marker: { color: '#BB75FF' },
      customdata: data.map(d => [d.name, d.totalPlayers, d.rank, d.rr, d.peRR]),
      hovertemplate: t('chart.rrByRank.hover.perr'),
      yaxis: 'y2',
    } as Data,
    // Regression line
    {
      type: 'scatter',
      x: fittedX,
      y: fittedY,
      mode: 'lines',
      name: t('chart.rrByRank.legend.trendline'),
      line: { color: 'rgba(54,234,201,0.4)' },
      hoverinfo: 'skip',
    } as Data,
  ]

  const layout: Partial<Layout> = {
    title: { text: t('chart.rrByRank.title') },
    height: 500,
    xaxis: {
      title: { text: t('chart.rrByRank.axis.rankPercentile') },
      type: 'log',
      // Significant-digit percent (`p`) with trailing zeros trimmed (`~`), so deep runs
      // stay distinguishable: 0.1% / 0.01% instead of both collapsing to "0%" under `.0%`.
      tickformat: ',.3~p',
      range: [0, log10OrNaN(minPercentile) - 0.2],
      autorange: false,
    },
    yaxis: {
      title: { text: t('chart.rrByRank.axis.rr') },
      type: 'log',
      range: [-1, log10OrNaN(Math.max(maxRR, 1)) + 0.1],
      autorange: false,
    },
    yaxis2: {
      title: { text: t('chart.rrByRank.axis.perr') },
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
        name: 'itm-cut', // so a test can name the shape it means, rather than describe it
        xref: 'x',
        // Data coordinates — a shape's, unlike an annotation's, are NOT log10. See the
        // note on the matching label below.
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
        text: t('chart.rrByRank.annotation.breakEven'),
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
        text: t('chart.rrByRank.annotation.itmCut'),
        xref: 'x',
        // log10, unlike the shape above that draws the very same cut-off at `1 / 8`.
        // On a log axis Plotly reads a shape's coordinates as data but an annotation's
        // as log10 — verified against a rendered plot, not assumed. Passing 1/8 here put
        // the label at 10^0.125 ≈ 133%, outside the axis range, where it never drew at
        // all. The break-even annotation below already does this (`Math.log10(1)`).
        x: Math.log10(1 / 8),
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
