/**
 * The situation ledger: what each preflop decision actually paid, against folding.
 *
 * Two panels over one shared row axis, which is the honest way to show this pair — an
 * average and a total are different scales and must never share an x-axis:
 *
 *   left   avg Δbb per decision, with a 95% interval. Zero is folding.
 *   right  total Δbb. Where the money actually is.
 *
 * The right panel exists because the left one lies by omission. A leak costing 0.15bb that
 * fires in 8% of hands outranks one costing 3bb that fires twice, and only the total says
 * so. Neither total nor any sum across rows is a bankroll — see preflopSituation.ts for
 * why Δ deliberately does not add up to raw profit.
 *
 * ## Colour carries significance, not sign
 *
 * A row is blue or red only when its 95% interval clears zero; otherwise it is grey. This
 * is the whole point of the chart. On a thin sample, 3-betting scored +4.79 ± 5.33bb —
 * paint that blue by its sign and the chart cheerfully reports a huge edge that the data
 * does not support. Grey says the only true thing: we cannot tell this apart from folding.
 *
 * Colour is never the sole cue. The interval visibly crossing the zero line says the same
 * thing, the legend names all three states, and n is printed into every row label — so the
 * distinction survives colour-blindness, greyscale printing, and a glance.
 *
 * ## Rows are comparable *within* a family, not down the whole chart
 *
 * Δ is measured against folding, and what folding costs depends on how much is already in
 * front of you. Open the pot and folding costs nothing, so "Open raise · BTN" scores near
 * zero — on a real 73k-hand sample, around +1bb. Face a 4-bet after 3-betting and folding
 * surrenders the 3-bet into a large pot, so almost any continuation beats it: "Call vs.
 * 4-bet · BTN" scores +31bb on the same sample. That is the geometry of the spot, not a
 * talent for calling 4-bets.
 *
 * So the ledger is not a leaderboard. Families are ordered by depth, and the honest read is
 * *across positions within one family* — where the pot is the same size and the comparison
 * means something. The caption says so, because a reader who ranks every row against every
 * other will conclude they should call more 4-bets, and the data does not say that.
 */

import type { Data, Layout } from 'plotly.js-dist-min'
import type { PreflopSituation, OpenerBucket } from '../../analysis/preflopSituation'
import type { Translate, TranslationKey } from '../../i18n'

export interface SituationLedgerData {
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

/** Below this, a row is noise dressed as a finding, and is withheld rather than drawn faintly. */
export const DEFAULT_MIN_SAMPLE = 30

export type StackBucket = 'short' | 'mid' | 'deepish' | 'deep'

/**
 * Table size, because a button offset means a different game at each one.
 *
 * Heads-up puts the button *on* the small blind, so `getHandHistoryOffsetFromButton`
 * reports the HU button as SB. An HU steal — where opening most of the deck is correct —
 * would otherwise be averaged into the same "Open raise · SB" row as a 6-max SB open, and
 * late-MTT play is heavily short-handed, so that is not a corner case.
 */
export type TableBucket = 'headsUp' | 'shorthanded' | 'full'

export interface LedgerFilters {
  openerBucket: OpenerBucket | 'any'
  stackBucket: StackBucket | 'any'
  tableBucket: TableBucket | 'any'
  minSample: number
}

export const DEFAULT_FILTERS: LedgerFilters = {
  openerBucket: 'any',
  stackBucket: 'any',
  tableBucket: 'any',
  minSample: DEFAULT_MIN_SAMPLE,
}

interface Family {
  key: TranslationKey
  match: (s: PreflopSituation) => boolean
}

/**
 * Every non-fold decision `classifyHand` can emit, matched by exactly one family.
 *
 * That "exactly one, and none left over" is not a style rule — it is asserted in
 * situationLedger.test.ts, because the failure it guards against is invisible. A decision
 * no family matches is computed, correct, and then silently dropped: it never becomes a
 * row, and it is not counted among the hidden ones either. A player bleeding a big blind
 * on every over-limp would open this chart, find no over-limp row, and conclude limping is
 * not one of their leaks. (This is exactly what shipped in the first draft.)
 *
 * Ordered by how much is already in the pot when Hero acts — the axis the caption tells
 * the reader to compare along. Declared rather than derived: `callSites.test.ts` requires
 * every translation key to appear as a literal in the source, so these cannot be assembled
 * from template strings.
 */
const FAMILIES: Family[] = [
  { key: 'chart.situation.family.rfi', match: s => s.context === 'unopened' && s.action === 'raise' && !s.allIn },
  { key: 'chart.situation.family.openJam', match: s => s.context === 'unopened' && s.action === 'raise' && s.allIn },
  { key: 'chart.situation.family.openLimp', match: s => s.context === 'unopened' && s.action === 'call' },
  { key: 'chart.situation.family.overLimp', match: s => s.context === 'limped' && s.action === 'call' },
  { key: 'chart.situation.family.isoRaise', match: s => s.context === 'limped' && s.action === 'raise' },
  { key: 'chart.situation.family.limpedCheck', match: s => s.context === 'limped' && s.action === 'check' },
  { key: 'chart.situation.family.flat', match: s => s.context === 'raised' && s.action === 'call' },
  { key: 'chart.situation.family.threeBet', match: s => s.context === 'raised' && s.action === 'raise' },
  { key: 'chart.situation.family.callMultiway', match: s => s.context === 'raisedCalled' && s.action === 'call' },
  { key: 'chart.situation.family.squeeze', match: s => s.context === 'raisedCalled' && s.action === 'raise' },
  { key: 'chart.situation.family.callVs3Bet', match: s => s.context === 'threeBet' && s.action === 'call' },
  { key: 'chart.situation.family.fourBet', match: s => s.context === 'threeBet' && s.action === 'raise' },
  { key: 'chart.situation.family.callVs4Bet', match: s => s.context === 'fourBetPlus' && s.action === 'call' },
  { key: 'chart.situation.family.fiveBet', match: s => s.context === 'fourBetPlus' && s.action === 'raise' },
]

/** Exposed for the coverage test, which is the only thing that can keep FAMILIES honest. */
export const LEDGER_FAMILIES: ReadonlyArray<Family> = FAMILIES

const POSITIONS: Array<[number, TranslationKey]> = [
  [-5, 'position.utg'],
  [-4, 'position.utg1'],
  [-3, 'position.mp'],
  [-2, 'position.mp1'],
  [-1, 'position.co'],
  [0, 'position.btn'],
  [1, 'position.sb'],
  [2, 'position.bb'],
]

export const OPENER_BUCKET_KEYS: Array<[OpenerBucket, TranslationKey]> = [
  ['ep', 'chart.situation.opener.ep'],
  ['mp', 'chart.situation.opener.mp'],
  ['lp', 'chart.situation.opener.lp'],
  ['blinds', 'chart.situation.opener.blinds'],
]

export const STACK_BUCKET_KEYS: Array<[StackBucket, TranslationKey]> = [
  ['short', 'chart.situation.stack.short'],
  ['mid', 'chart.situation.stack.mid'],
  ['deepish', 'chart.situation.stack.deepish'],
  ['deep', 'chart.situation.stack.deep'],
]

export const TABLE_BUCKET_KEYS: Array<[TableBucket, TranslationKey]> = [
  ['headsUp', 'chart.situation.table.headsUp'],
  ['shorthanded', 'chart.situation.table.shorthanded'],
  ['full', 'chart.situation.table.full'],
]

function stackBucketOf(stackBB: number): StackBucket {
  if (stackBB < 15) return 'short'
  if (stackBB < 25) return 'mid'
  if (stackBB < 40) return 'deepish'
  return 'deep'
}

function tableBucketOf(tableSize: number): TableBucket {
  if (tableSize <= 2) return 'headsUp'
  if (tableSize <= 6) return 'shorthanded'
  return 'full'
}

interface LedgerRow {
  label: string
  n: number
  mean: number
  /** Half-width of the 95% interval. Zero when n < 2, where no interval is defined. */
  ci95: number
  total: number
}

function summarize(deltas: number[]): Omit<LedgerRow, 'label'> {
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
function colorOf(row: LedgerRow): string {
  if (row.n < 2) return INCONCLUSIVE
  if (row.mean - row.ci95 > 0) return BEAT_FOLD
  if (row.mean + row.ci95 < 0) return LOST_TO_FOLD
  return INCONCLUSIVE
}

function passesFilters(s: PreflopSituation, f: LedgerFilters): boolean {
  if (f.openerBucket !== 'any' && s.openerBucket !== f.openerBucket) return false
  if (f.stackBucket !== 'any' && stackBucketOf(s.heroStackBB) !== f.stackBucket) return false
  if (f.tableBucket !== 'any' && tableBucketOf(s.tableSize) !== f.tableBucket) return false
  return true
}

export function buildLedgerRows(
  situations: PreflopSituation[],
  filters: LedgerFilters,
  t: Translate
): { rows: LedgerRow[]; hidden: number } {
  // One pass, bucketing as we go. A filter-per-family-per-position sweep is ~90 passes
  // over a six-figure array, and it runs synchronously inside a useMemo on every dropdown
  // change — which is to say, it blocks paint.
  const deltas = new Map<string, number[]>()
  for (const s of situations) {
    if (!passesFilters(s, filters)) continue
    const familyIndex = FAMILIES.findIndex(f => f.match(s))
    if (familyIndex < 0) continue // a fold: Δ is 0 by construction, so it is not a row
    const key = `${familyIndex}|${s.heroOffset}`
    const bucket = deltas.get(key)
    if (bucket) bucket.push(s.deltaBB)
    else deltas.set(key, [s.deltaBB])
  }

  const rows: LedgerRow[] = []
  let hidden = 0

  // Emitted in declaration order rather than Map order, so the chart is stable across
  // datasets and the depth ordering the caption promises actually holds.
  FAMILIES.forEach((family, familyIndex) => {
    for (const [offset, posKey] of POSITIONS) {
      const bucket = deltas.get(`${familyIndex}|${offset}`)
      if (!bucket) continue

      const stats = summarize(bucket)
      if (stats.n < filters.minSample) {
        hidden++
        continue
      }
      rows.push({
        label: t('chart.situation.ledger.rowLabel', {
          family: t(family.key),
          position: t(posKey),
          n: stats.n,
        }),
        ...stats,
      })
    }
  })

  return { rows, hidden }
}

export function getSituationLedgerData(
  situations: PreflopSituation[],
  filters: LedgerFilters,
  t: Translate
): SituationLedgerData {
  const { rows, hidden } = buildLedgerRows(situations, filters, t)

  // Rows are laid out top-down in declaration order, so the y axis counts downward.
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
      hovertext: idx.map(i => rows[i].label),
      customdata: idx.map(i => [rows[i].n, rows[i].ci95]),
      hovertemplate: t('chart.situation.ledger.hover.mean'),
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
      hovertext: idx.map(i => rows[i].label),
      customdata: idx.map(i => [rows[i].n]),
      hovertemplate: t('chart.situation.ledger.hover.total'),
      xaxis: 'x2',
      yaxis: 'y',
    } as Data)
  }

  // Stacked upward from the top of the plot area in *pixels*: the chart's height varies
  // with the row count, so paper-relative offsets would drift line-spacing as it grows.
  const captionKeys: TranslationKey[] = [
    // First, because it is the question a reader asks before any other: what *is* a row?
    // The position in a row label is always Hero's, even in the rows that are a response
    // to someone else — "3-bet vs. open · CO" is Hero 3-betting from the cutoff, against
    // an opener who could have been anywhere. The opponent's seat is not in the row at
    // all; it is the opener filter. Nothing about the label says so.
    'chart.situation.ledger.caption.row',
    'chart.situation.ledger.caption.reading',
    'chart.situation.ledger.caption.scale',
    'chart.situation.ledger.caption.caveat',
  ]
  const caption = captionKeys.map(key => t(key))
  if (hidden > 0) {
    caption.push(t('chart.situation.ledger.caption.hidden', { hidden }))
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
    title: { text: t('chart.situation.ledger.title') },
    height,
    margin: { l: 300, r: 40, t: marginTop, b: marginBottom },
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
      title: { text: t('chart.situation.ledger.axis.mean') },
      zeroline: true,
      zerolinecolor: '#898781',
      zerolinewidth: 2,
      gridcolor: '#e1e0d9',
    },
    xaxis2: {
      domain: [0.7, 1],
      anchor: 'y',
      title: { text: t('chart.situation.ledger.axis.total') },
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
