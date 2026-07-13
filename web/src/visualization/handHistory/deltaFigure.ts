/**
 * The two-panel Δbb figure that both situation charts are drawn as.
 *
 * Rows on a shared axis; average on the left with a 95% interval, total on the right:
 *
 *   left   avg Δbb per decision. Zero is folding.
 *   right  total Δbb. Where the money actually is.
 *
 * The right panel exists because the left one lies by omission. A leak costing 0.15bb that
 * fires in 8% of hands outranks one costing 3bb that fires twice, and only the total says
 * so. Neither total, nor any sum across rows, is a bankroll — see preflopSituation.ts for
 * why Δ deliberately does not add up to raw profit.
 *
 * ## Colour carries significance, not sign
 *
 * A row is blue or red only when its 95% interval clears zero; otherwise it is grey. This
 * is the whole point. On a real sample, 3-betting scored +4.79 ± 5.33bb — paint that blue
 * by its sign and the chart cheerfully reports a huge edge that the data does not support.
 * Grey says the only true thing: we cannot tell this apart from folding.
 *
 * Colour is never the sole cue. The interval visibly crossing the zero line says the same
 * thing, the legend names all three states, and n is printed into every row label — so the
 * distinction survives colour-blindness, greyscale printing, and a glance.
 *
 * Shared by the ledger and the hand-class chart so the two cannot drift: they sit on one
 * screen, and two charts that scored significance differently, or coloured it differently,
 * would be a lie told quietly.
 */

import type { Data, Layout } from 'plotly.js-dist-min'
import type { Translate, TranslationKey } from '../../i18n'

export interface DeltaFigure {
  traces: Data[]
  layout: Partial<Layout>
  /**
   * How to read the chart, and what it does not mean. Rendered as HTML beside the figure,
   * never as a Plotly annotation: an annotation is one unbreakable line, so on a narrow
   * window it simply runs off the edge of the plot. Prose has to wrap.
   */
  caption: string[]
}

/**
 * Validated against the light surface Plotly actually paints on (#fcfcfb): worst adjacent
 * CVD separation ΔE 74.6, every step ≥ 3:1 on the surface. Blue↔red rather than the
 * green↔red poker convention, which is precisely the pair deuteranopes cannot separate.
 */
const BEAT_FOLD = '#2a78d6'
const LOST_TO_FOLD = '#e34948'
/** The neutral midpoint of the diverging pair: a decision we cannot tell apart from folding. */
const INCONCLUSIVE = '#898781'

export interface DeltaRow {
  label: string
  /**
   * What this row *means*, shown under its name on hover. Optional.
   *
   * "Flat / defend vs. open" and "Call vs. open + caller(s)" are not self-explanatory, and
   * neither are "Iso-raise" and "Squeeze" — the first reader of this chart had to ask which
   * was which. The answer belongs on the row, because that is where the question occurs:
   * a glossary in the repo is not open when you are staring at a tooltip. It also rides
   * along into the exported HTML for free, since Plotly hover is part of the figure.
   */
  description?: string
  n: number
  mean: number
  /** Half-width of the 95% interval. Zero when n < 2, where no interval is defined. */
  ci95: number
  total: number
}

/**
 * Break a line at word boundaries, because Plotly will not.
 *
 * Hover text is broken **only** on an explicit `<br>` — there is no width-based wrapping and
 * no max width. A 167-character description therefore renders as one ~1100px line: as wide as
 * the whole chart on a desktop, and clipped at the plot edge on anything smaller.
 *
 * Done here rather than by seeding `<br>` into the strings themselves, because a translator
 * would then have to remember to re-break every sentence they rewrite — and a Korean
 * rendering of the same sentence is a different length anyway. The code knows the budget; the
 * translator should only have to know the language.
 */
function wrap(text: string, width = 64): string {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.join('<br>')
}

/** The row's name, with its meaning beneath it when it has one. */
export function hoverLabel(row: DeltaRow): string {
  return row.description
    ? `<b>${row.label}</b><br><i>${wrap(row.description)}</i>`
    : row.label
}

/**
 * The statistics of a bucket — and *only* the statistics.
 *
 * Deliberately not `Omit<DeltaRow, 'label'>`: that would now include `description`, and every
 * caller spreads this over a row literal. The day this returned an explicit
 * `description: undefined`, the spread would overwrite the caller's and every row would
 * silently lose its hover text. A `Pick` cannot: it also says the truer thing, which is that
 * summarising a sample has nothing to do with naming it.
 */
export function summarize(deltas: number[]): Pick<DeltaRow, 'n' | 'mean' | 'ci95' | 'total'> {
  const n = deltas.length
  const mean = deltas.reduce((a, b) => a + b, 0) / n
  if (n < 2) return { n, mean, ci95: 0, total: mean * n }

  const variance = deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1)
  // Normal approximation. Poker results are heavy-tailed, so at the low end of the sample
  // threshold this interval is optimistic — it is a floor on the uncertainty, not a ceiling.
  return { n, mean, ci95: (1.96 * Math.sqrt(variance)) / Math.sqrt(n), total: mean * n }
}

/**
 * Blue/red only where the interval clears zero. Everything else is honestly grey.
 *
 * Keyed on `n`, not on `ci95 === 0`: a sample of two identical results also has a
 * zero-width interval, and painting *that* grey would say "indistinguishable from folding"
 * about the one kind of row where we are, in fact, certain.
 */
function colorOf(row: DeltaRow): string {
  if (row.n < 2) return INCONCLUSIVE
  if (row.mean - row.ci95 > 0) return BEAT_FOLD
  if (row.mean + row.ci95 < 0) return LOST_TO_FOLD
  return INCONCLUSIVE
}

interface DeltaFigureOptions {
  /** Already translated. */
  title: string
  /** Already translated, one paragraph per entry. */
  caption: string[]
  /** Room for the row labels; the hand classes need far less of it than the ledger rows. */
  leftMargin: number
}

export function buildDeltaFigure(
  rows: DeltaRow[],
  { title, caption, leftMargin }: DeltaFigureOptions,
  t: Translate
): DeltaFigure {
  // Rows are laid out top-down in the order given, so the y axis counts downward.
  const y = rows.map((_, i) => i)

  const groups: Array<[string, TranslationKey]> = [
    [BEAT_FOLD, 'chart.situation.legend.beatFold'],
    [LOST_TO_FOLD, 'chart.situation.legend.lostToFold'],
    [INCONCLUSIVE, 'chart.situation.legend.inconclusive'],
  ]

  const traces: Data[] = []

  for (const [color, legendKey] of groups) {
    const idx = y.filter(i => colorOf(rows[i]) === color)
    if (idx.length === 0) continue

    // One trace per significance state rather than per-point colours: Plotly paints an
    // error bar in a single colour per trace, and it buys a legend that names the states.
    traces.push({
      type: 'scatter',
      mode: 'markers',
      name: t(legendKey),
      legendgroup: color,
      x: idx.map(i => rows[i].mean),
      y: idx,
      error_x: {
        type: 'data',
        array: idx.map(i => rows[i].ci95),
        color,
        thickness: 2,
        width: 4,
      },
      marker: { color, size: 9, line: { color: '#fcfcfb', width: 1 } },
      // y is an index, so the row name has to travel with the point for the tooltip.
      // `hovertext`, not `text` — `text` on a bar trace is *drawn on the bar*, which stamps
      // every row label across the panel beside it. The template must then read it back as
      // `%{hovertext}`: `%{text}` is a *different* field, and resolves to a bare "-".
      hovertext: idx.map(i => hoverLabel(rows[i])),
      customdata: idx.map(i => [rows[i].n, rows[i].ci95]),
      hovertemplate: t('chart.situation.hover.mean'),
      xaxis: 'x',
      yaxis: 'y',
    } as Data)

    traces.push({
      type: 'bar',
      orientation: 'h',
      name: t(legendKey),
      legendgroup: color,
      showlegend: false,
      x: idx.map(i => rows[i].total),
      y: idx,
      width: 0.62,
      marker: { color },
      hovertext: idx.map(i => hoverLabel(rows[i])),
      customdata: idx.map(i => [rows[i].n]),
      hovertemplate: t('chart.situation.hover.total'),
      xaxis: 'x2',
      yaxis: 'y',
    } as Data)
  }

  // The top margin clears the title; the bottom clears the tick labels, the axis title, and
  // then the legend below both. The caption is not in here — it is prose, it has to wrap,
  // and a Plotly annotation cannot. It is rendered as HTML beside the figure instead.
  const marginTop = 70
  const marginBottom = 150
  const height = Math.max(460, rows.length * 28 + marginTop + marginBottom + 10)

  // A legend takes no `yshift`, unlike an annotation — only a paper-space `y` — so the
  // 95px drop that clears the axis title has to be expressed as a fraction of the plot
  // area, which changes with the row count.
  const legendY = -95 / (height - marginTop - marginBottom)

  const layout: Partial<Layout> = {
    title: { text: title },
    height,
    margin: { l: leftMargin, r: 40, t: marginTop, b: marginBottom },
    showlegend: true,
    // Below the panels: at the top it would collide with the title on a narrow window.
    legend: {
      orientation: 'h',
      x: 0,
      xanchor: 'left',
      y: legendY,
      yanchor: 'top',
    },
    bargap: 0.35,
    hovermode: 'closest',
    xaxis: {
      domain: [0, 0.6],
      title: { text: t('chart.situation.axis.mean') },
      zeroline: true,
      zerolinecolor: '#898781',
      zerolinewidth: 2,
      gridcolor: '#e1e0d9',
    },
    xaxis2: {
      domain: [0.7, 1],
      anchor: 'y',
      title: { text: t('chart.situation.axis.total') },
      zeroline: true,
      zerolinecolor: '#898781',
      zerolinewidth: 2,
      gridcolor: '#e1e0d9',
    },
    yaxis: {
      tickmode: 'array',
      tickvals: y,
      ticktext: rows.map(r => r.label),
      autorange: 'reversed',
      showgrid: false,
      tickfont: { size: 11 },
      // The y axis is a *list*, not a scale — the rows are named categories, and the chart
      // is already tall enough to show every one of them. Zooming it only ever loses rows,
      // and the row you drag away is the one whose label you needed to read. Zooming the
      // value axes still works, which is the zoom anyone actually wants here.
      fixedrange: true,
    },
  }

  return { traces, layout, caption }
}
