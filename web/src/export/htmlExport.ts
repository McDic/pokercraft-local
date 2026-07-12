/**
 * HTML export utility for generating standalone Plotly chart files
 */

import type { Data, Layout } from 'plotly.js-dist-min'
import { getVersionInfo } from '../utils/version'
import type { Translate } from '../i18n'

export interface ExportChart {
  /** Already translated; rendered as the chart's heading in the exported file. */
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
  .chart-title {
    font-size: 1rem;
    font-weight: 500;
    color: #888;
    margin: 1.5rem 0 0.5rem 0;
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

/**
 * Serialize a value for embedding inside an inline `<script>` element.
 *
 * `JSON.stringify` escapes neither `<` nor `/`, so a tournament named
 * `"</script>..."` — the name is copied verbatim out of the uploaded summary file,
 * and reaches the export through trace names and `customdata` — would close the
 * script element early, leaving a chart-less page. Escaping `<` as the `<`
 * escape keeps the JSON semantically identical while making `</script>`
 * unrepresentable, so the tokenizer can never leave the script-data state.
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function buildChartDivs(charts: ExportChart[], prefix: string): string {
  return charts
    .map(
      (chart, i) =>
        `<h3 class="chart-title">${escapeHtml(chart.name)}</h3>\n      ` +
        `<div class="chart-container"><div id="${prefix}-${i}" style="width:100%;"></div></div>`
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
        ${embedJson(divId)},
        ${embedJson(chart.traces)},
        ${embedJson(layout)},
        {responsive: true}
      );`
    })
    .join('\n      ')
}

/**
 * Build the standalone HTML file.
 *
 * The charts' own text needs no work here: every title, axis, legend and hover
 * template was already translated when the figure was built, and the layouts are
 * serialized wholesale below. Only the page's own chrome is translated here.
 */
export function generateExportHTML(
  tournamentCharts: ExportChart[],
  handHistoryCharts: ExportChart[],
  t: Translate,
  language: string
): string {
  const timestamp = new Date().toLocaleString(language)
  const version = getVersionInfo(t)
  const versionHtml = version.url
    ? `<a href="${escapeHtml(version.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(version.text)}</a>`
    : escapeHtml(version.text)

  const hasTournament = tournamentCharts.length > 0
  const hasHandHistory = handHistoryCharts.length > 0

  return `<!DOCTYPE html>
<html lang="${escapeHtml(language)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(t('export.title'))}</title>
  <script src="${escapeHtml(PLOTLY_CDN)}"><\/script>
  <style>${THEME_CSS}</style>
</head>
<body>
  <div class="export-header">
    <h1>${escapeHtml(t('export.heading'))}</h1>
    <div class="meta">${escapeHtml(t('export.meta.exportedOn', { timestamp }))} &middot; ${versionHtml}</div>
  </div>
  ${
    hasTournament
      ? `<h2 class="section-title">${escapeHtml(t('export.section.tournament'))}</h2>
      ${buildChartDivs(tournamentCharts, 'tournament')}`
      : ''
  }
  ${
    hasHandHistory
      ? `<h2 class="section-title">${escapeHtml(t('export.section.handHistory'))}</h2>
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
