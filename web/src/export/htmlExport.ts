/**
 * HTML export utility for generating standalone Plotly chart files
 */

import type { Data, Layout } from 'plotly.js-dist-min'

export interface ExportChart {
  name: string
  traces: Data[]
  layout: Partial<Layout>
}

const PLOTLY_CDN = 'https://cdn.plot.ly/plotly-3.3.1.min.js'

const THEME_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #111;
    color: #ddd;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 2rem;
  }
  .export-header {
    text-align: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #333;
  }
  .export-header h1 { font-size: 1.75rem; color: #fff; margin-bottom: 0.25rem; }
  .export-header .meta { color: #666; font-size: 0.8rem; }
  .section-title {
    font-size: 1.25rem;
    color: #aaa;
    margin: 2rem 0 1rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #282828;
  }
  .chart-container {
    background: #fff;
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    overflow: hidden;
  }
`

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildChartDivs(charts: ExportChart[], prefix: string): string {
  return charts
    .map(
      (_, i) => `<div class="chart-container"><div id="${prefix}-${i}" style="width:100%;"></div></div>`
    )
    .join('\n      ')
}

/** Override axis colors for light background readability */
function patchAxesForLightTheme(layout: Partial<Layout>): Record<string, unknown> {
  const src = layout as Record<string, unknown>
  const patched: Record<string, unknown> = { ...src }
  const axisOverrides = { gridcolor: '#ddd', zerolinecolor: '#bbb', linecolor: '#ccc' }

  for (const key of Object.keys(src)) {
    if (/^[xy]axis\d*$/.test(key) && typeof src[key] === 'object' && src[key] !== null) {
      patched[key] = { ...(src[key] as object), ...axisOverrides }
    }
  }
  return patched
}

function buildPlotCalls(charts: ExportChart[], prefix: string): string {
  return charts
    .map((chart, i) => {
      const divId = `${prefix}-${i}`
      const layout: Record<string, unknown> = {
        ...patchAxesForLightTheme(chart.layout),
        autosize: true,
        paper_bgcolor: '#fff',
        plot_bgcolor: '#fff',
        font: { ...((chart.layout as Record<string, unknown>).font as object), color: '#333' },
      }
      return `Plotly.newPlot(
        ${JSON.stringify(divId)},
        ${JSON.stringify(chart.traces)},
        ${JSON.stringify(layout)},
        {responsive: true}
      );`
    })
    .join('\n      ')
}

export function generateExportHTML(
  tournamentCharts: ExportChart[],
  handHistoryCharts: ExportChart[]
): string {
  const timestamp = new Date().toLocaleString()
  const appVersion = __APP_VERSION__

  const hasTournament = tournamentCharts.length > 0
  const hasHandHistory = handHistoryCharts.length > 0

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pokercraft Local - Exported Charts</title>
  <script src="${escapeHtml(PLOTLY_CDN)}"><\/script>
  <style>${THEME_CSS}</style>
</head>
<body>
  <div class="export-header">
    <h1>Pokercraft Local</h1>
    <div class="meta">Exported on ${escapeHtml(timestamp)} &middot; v${escapeHtml(appVersion)}</div>
  </div>
  ${
    hasTournament
      ? `<h2 class="section-title">Tournament Summary</h2>
      ${buildChartDivs(tournamentCharts, 'tournament')}`
      : ''
  }
  ${
    hasHandHistory
      ? `<h2 class="section-title">Hand History</h2>
      ${buildChartDivs(handHistoryCharts, 'hand')}`
      : ''
  }
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      ${hasTournament ? buildPlotCalls(tournamentCharts, 'tournament') : ''}
      ${hasHandHistory ? buildPlotCalls(handHistoryCharts, 'hand') : ''}
    });
  <\/script>
</body>
</html>`
}

export function downloadHTML(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
