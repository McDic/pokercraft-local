/**
 * HTML export utility for generating standalone Plotly chart files.
 *
 * Most sections are pictures: traces and a layout, serialized, drawn once. The situation
 * section is not — it ships the decisions and the aggregation code, and its filter dropdowns
 * keep working after the file is downloaded. See `situationRuntime.ts`.
 */

import type { Data, Layout } from 'plotly.js-dist-min'
import runtimeSource from 'virtual:situation-runtime'
import { getVersionInfo } from '../utils/version'
import type { Translate, TranslationKey } from '../i18n'
import type { SituationExport } from './situationPayload'
import { toLightLayout } from './lightTheme'

export interface ExportChart {
  /** Already translated; rendered as the chart's heading in the exported file. */
  name: string
  traces: Data[]
  layout: Partial<Layout>
  /**
   * Already translated. Prose that has to travel with the chart — how to read it, what it
   * does not mean — one paragraph per entry.
   *
   * It lives here rather than in a Plotly annotation because prose has to *wrap*, and a
   * Plotly annotation is a single unbreakable line: narrow the window and it runs off the
   * edge of the figure. A caption is HTML, so the browser wraps it for free.
   */
  caption?: string[]
}

/** One heading's worth of the exported page. */
export interface ExportSection {
  titleKey: TranslationKey
  /** Prefix for the generated div ids; must be unique across sections on the page. */
  prefix: string
  charts: ExportChart[]
  /**
   * Renders as a *live* block instead of static figures: filter dropdowns, two charts, and
   * enough data to re-aggregate them in the downloaded file.
   *
   * A section has one or the other, never both. The situation tab's charts only mean anything
   * next to the filters that produced them — an exported picture of "Open raise · SB" is a
   * different claim at 12bb than at 60bb, and a static file could not say which, let alone let
   * you change it.
   */
  situation?: SituationExport
}

/** Is there anything in this section worth a heading? */
function isPresent(section: ExportSection): boolean {
  return section.charts.length > 0 || section.situation !== undefined
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
  .chart-caption {
    font-size: 0.8rem;
    line-height: 1.5;
    color: #777;
    max-width: 100%;
    margin: 0 0 0.4rem 0;
  }
  .chart-container {
    background: #fff;
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    overflow: hidden;
  }
  .situation-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    background: #191919;
    border: 1px solid #2c2c2c;
    border-radius: 8px;
  }
  .situation-filters label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.75rem;
    color: #888;
  }
  .situation-filters select {
    background: #222;
    color: #ddd;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    font-family: inherit;
    min-width: 11rem;
  }
  .situation-filters select:hover { border-color: #555; }
  .no-data {
    padding: 2rem;
    text-align: center;
    color: #666;
    background: #191919;
    border-radius: 8px;
    margin-bottom: 1.5rem;
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
        (chart.caption ?? [])
          .map(line => `<p class="chart-caption">${escapeHtml(line)}</p>\n      `)
          .join('') +
        `<div class="chart-container"><div id="${prefix}-${i}" style="width:100%;"></div></div>`
    )
    .join('\n      ')
}

function buildPlotCalls(charts: ExportChart[], prefix: string): string {
  return charts
    .map(
      (chart, i) => `Plotly.newPlot(
        ${embedJson(`${prefix}-${i}`)},
        ${embedJson(chart.traces)},
        ${embedJson(toLightLayout(chart.layout))},
        {responsive: true}
      );`
    )
    .join('\n      ')
}

/**
 * The bundled runtime, made safe to sit inside a `<script>` element.
 *
 * A `</script` anywhere in the source — even inside a string literal — ends the element and
 * spills the rest of the bundle onto the page as text. Backslash-escaping the slash is inert
 * in both of the places the sequence could legally occur (a string literal and a regex
 * literal), so the JavaScript means exactly the same thing and the tokenizer can no longer
 * leave the script-data state.
 */
function embedScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script')
}

/**
 * Build the standalone HTML file.
 *
 * The charts' own text needs no work here: every title, axis, legend and hover
 * template was already translated when the figure was built, and the layouts are
 * serialized wholesale below. Only the page's own chrome is translated here.
 */
export function generateExportHTML(
  sections: ExportSection[],
  t: Translate,
  language: string
): string {
  const timestamp = new Date().toLocaleString(language)
  const version = getVersionInfo(t)
  const versionHtml = version.url
    ? `<a href="${escapeHtml(version.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(version.text)}</a>`
    : escapeHtml(version.text)

  // A list rather than one parameter per section: the export follows the tabs, and a
  // positional (tournament, handHistory) pair had already started lying about which tab it
  // came from as soon as a third tab existed.
  const present = sections.filter(isPresent)

  // The runtime is inlined once, and only when something needs it — it is dead weight in a
  // tournament export, which has no filters to drive.
  const live = present.filter(s => s.situation !== undefined)

  return `<!DOCTYPE html>
<html lang="${escapeHtml(language)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(t('export.title'))}</title>
  <script src="${escapeHtml(PLOTLY_CDN)}"></script>
  <style>${THEME_CSS}</style>
</head>
<body>
  <div class="export-header">
    <h1>${escapeHtml(t('export.heading'))}</h1>
    <div class="meta">${escapeHtml(t('export.meta.exportedOn', { timestamp }))} &middot; ${versionHtml}</div>
  </div>
  ${present
    .map(
      s => `<h2 class="section-title">${escapeHtml(t(s.titleKey))}</h2>
      ${
        s.situation
          ? `<div id="${s.prefix}-app"></div>`
          : buildChartDivs(s.charts, s.prefix)
      }`
    )
    .join('\n  ')}
  ${live.length > 0 ? `<script>${embedScript(runtimeSource)}</script>` : ''}
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      ${present
        .filter(s => s.situation === undefined)
        .map(s => buildPlotCalls(s.charts, s.prefix))
        .join('\n      ')}
      ${live
        .map(
          s => `PokercraftSituation.mount(
        document.getElementById(${embedJson(`${s.prefix}-app`)}),
        ${embedJson(s.situation)}
      );`
        )
        .join('\n      ')}
    });
  </script>
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
