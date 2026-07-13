/**
 * Bankroll Analysis Chart
 * Shows bankruptcy/survival rates using Monte Carlo simulation (WASM)
 */

import type { Translate } from '../../i18n'
import type { Data, Layout } from 'plotly.js-dist-min'

export interface BankrollResult {
  initialCapital: number
  bankruptcyRate: number
  survivalRate: number
}

export interface BankrollAnalysisData {
  traces: Data[]
  layout: Partial<Layout>
}

/**
 * Generate bankroll analysis chart data
 */
export function getBankrollAnalysisData(
  results: BankrollResult[],
  t: Translate
): BankrollAnalysisData {
  if (results.length === 0) {
    return {
      traces: [],
      layout: {
        title: { text: t('chart.bankroll.title') },
        annotations: [
          {
            text: t('chart.bankroll.noData'),
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

  const labels = results.map(r => t('chart.bankroll.tick.buyIns', { capital: r.initialCapital }))
  const bankruptcyRates = results.map(r => r.bankruptcyRate)
  const survivalRates = results.map(r => r.survivalRate)

  const traces: Data[] = [
    {
      type: 'bar',
      x: labels,
      y: bankruptcyRates,
      name: t('chart.bankroll.legend.bankruptcy'),
      marker: { color: 'rgb(242, 111, 111)' },
      text: bankruptcyRates.map(r => `${(r * 100).toFixed(1)}%`),
      textposition: 'auto',
      hovertemplate: t('chart.bankroll.hover.rate'),
    } as Data,
    {
      type: 'bar',
      x: labels,
      y: survivalRates,
      name: t('chart.bankroll.legend.survival'),
      marker: { color: 'rgb(113, 222, 139)' },
      text: survivalRates.map(r => `${(r * 100).toFixed(1)}%`),
      textposition: 'auto',
      hovertemplate: t('chart.bankroll.hover.rate'),
    } as Data,
  ]

  const layout: Partial<Layout> = {
    title: { text: t('chart.bankroll.title') },
    barmode: 'stack',
    yaxis: {
      tickformat: '.0%',
      range: [0, 1],
    },
    xaxis: {
      title: { text: t('chart.bankroll.axis.initialCapital') },
    },
    legend: {
      title: { text: t('chart.bankroll.legend.title') },
      orientation: 'h',
      xanchor: 'center',
      x: 0.5,
      yanchor: 'top',
      y: -0.3,
    },
    height: 400,
  }

  return { traces, layout }
}
