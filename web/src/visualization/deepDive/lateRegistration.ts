/**
 * The Late Registration vs ROI figure — entries bucketed by entry depth, drawn with the
 * two-panel significance machinery from `deltaFigure.ts`.
 *
 * Zero here is **break-even**, not folding: the left panel is the mean relative return per
 * entry (in buy-ins, so −1 is a lost bullet), the right panel is the bucket's net profit in
 * USD — where the money actually is. Colour still carries significance, not sign: a bucket is
 * blue or red only when its 95% interval clears break-even.
 *
 * The top row is every entry made at blind level 1 — on time by definition, *whatever* its
 * depth. Depth alone cannot say "late": formats that simply start shallow (hypers, Flip & Go)
 * enter level 1 at well under 15 BB, and on a real ~4-month dataset they were 42% of the
 * sub-15 BB entries — enough to swamp the very bucket that reads as "registered latest".
 * Only level ≥ 2 entries are late registrations, and those are bucketed by entry depth in
 * big blinds, deepest first, so the late rows read top-down as "later and later". Depth is
 * the right axis for them because it is what late registration costs you. Edges validated
 * on the same dataset so no bucket is left holding a handful of entries.
 */

import type { Data, Layout } from 'plotly.js-dist-min'
import type { LateRegEntry, LateRegResult } from '../../analysis/lateRegistration'
import type { Translate } from '../../i18n'
import {
  buildDeltaFigure,
  summarize,
  type DeltaFigure,
  type DeltaFigureKeys,
  type DeltaRow,
} from '../handHistory/deltaFigure'

const KEYS: DeltaFigureKeys = {
  legendAbove: 'deepDive.lateReg.legend.profitable',
  legendBelow: 'deepDive.lateReg.legend.losing',
  legendInconclusive: 'deepDive.lateReg.legend.inconclusive',
  axisMean: 'deepDive.lateReg.axis.mean',
  axisTotal: 'deepDive.lateReg.axis.total',
  hoverMean: 'deepDive.lateReg.hover.mean',
  hoverTotal: 'deepDive.lateReg.hover.total',
}

interface StackBucketDef {
  /** Inclusive lower bound of the entry stack, in big blinds. */
  min: number
  /** Plain numeric range; language-independent, so not a translation key. */
  range: string
}

/** Deepest (earliest registration) first. The final `min: 0` bucket catches everything else. */
const LATE_BUCKETS: StackBucketDef[] = [
  { min: 100, range: '100+' },
  { min: 60, range: '60–100' },
  { min: 25, range: '25–60' },
  { min: 15, range: '15–25' },
  { min: 0, range: '<15' },
]

/** Median of an unsorted sample; callers guarantee it is non-empty. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function getLateRegistrationData(result: LateRegResult, t: Translate): DeltaFigure {
  const onTime: LateRegEntry[] = []
  const byBucket: LateRegEntry[][] = LATE_BUCKETS.map(() => [])
  for (const e of result.entries) {
    if (e.level === 1) onTime.push(e)
    else byBucket[LATE_BUCKETS.findIndex(b => e.stackBB >= b.min)].push(e)
  }

  // The total panel is real dollars, not summed relative returns: buy-ins differ across
  // tournaments, so only USD answers "where the money actually is".
  const rows: DeltaRow[] = []
  if (onTime.length > 0) {
    const stats = summarize(onTime.map(e => e.rr))
    rows.push({
      label: t('deepDive.lateReg.onTimeLabel', { n: stats.n }),
      description: t('deepDive.lateReg.onTimeDesc', {
        bb: Math.round(median(onTime.map(e => e.stackBB))),
      }),
      ...stats,
      total: onTime.reduce((sum, e) => sum + e.profitUsd, 0),
    })
  }
  LATE_BUCKETS.forEach((bucket, i) => {
    const entries = byBucket[i]
    if (entries.length === 0) return

    const stats = summarize(entries.map(e => e.rr))
    rows.push({
      label: t('deepDive.lateReg.rowLabel', { range: bucket.range, n: stats.n }),
      description: t('deepDive.lateReg.bucketDesc', {
        level: Math.round(median(entries.map(e => e.level))),
        minutes: Math.round(median(entries.map(e => e.minutesLate))),
      }),
      ...stats,
      total: entries.reduce((sum, e) => sum + e.profitUsd, 0),
    })
  })

  return buildDeltaFigure(
    rows,
    // The section heading already names the chart, and its prose is rendered as section
    // captions by DeepDiveCharts — so the figure itself carries neither. The margin fits
    // the widest row label, the Korean on-time row "정시 등록 — 레벨 1 (n=…)".
    { title: '', caption: [], leftMargin: 200, keys: KEYS },
    t
  )
}

// ============================================================================
// Return-distribution heatmap
// ============================================================================

export interface LateRegHeatmapData {
  traces: Data[]
  layout: Partial<Layout>
  /** How to read the chart; one paragraph per entry. Rendered as section captions. */
  caption: string[]
}

/**
 * Depth bands for the heatmap's y axis, shallowest first because Plotly draws the first
 * category at the bottom. Log-2 spaced: 15 vs. 25 BB is a bigger strategic difference than
 * 60 vs. 100 BB, so equal-width bins would spend most of their rows where nothing changes.
 */
const DEPTH_BANDS = [
  { min: 0, range: '<16' },
  { min: 16, range: '16–32' },
  { min: 32, range: '32–64' },
  { min: 64, range: '64–128' },
  { min: 128, range: '128+' },
]

/**
 * Return columns in multiples of the buy-in, log-2 spaced above 0.25×, plus a dedicated
 * bust column: zero return has no logarithm, and ~85% of entries land there — dropping
 * them (as a log transform silently would) turns a profit distribution into a cash-only
 * highlight reel.
 */
const RETURN_EDGES = [0.25, 0.5, 1, 2, 4, 8, 16]
const RETURN_COLS = ['<0.25×', '0.25–0.5×', '0.5–1×', '1–2×', '2–4×', '4–8×', '8–16×', '16×+']

function depthBandOf(stackBB: number): number {
  for (let i = DEPTH_BANDS.length - 1; i >= 0; i--) {
    if (stackBB >= DEPTH_BANDS[i].min) return i
  }
  return 0
}

/** Column index into `[bust, ...RETURN_COLS]` for a return of `multiple` × buy-in. */
function returnColOf(multiple: number): number {
  if (multiple <= 0) return 0
  let col = 1
  for (const edge of RETURN_EDGES) {
    if (multiple < edge) break
    col++
  }
  return col
}

/**
 * Entry counts per (depth band × return band), each row normalised to its own total:
 * the question is "given an entry at this depth, how did it pay?", and rows differ in
 * size by an order of magnitude, so raw counts would only ever show where the data is.
 *
 * Colour encodes sqrt(share): on a linear scale the bust column (~0.85) pins the top of
 * the colorbar and every cash cell (a few percent each) is near-white. The square root
 * keeps the mapping monotone and honest — the colorbar ticks are relabelled to true
 * shares, and the hover always states the exact share and count.
 */
export function getLateRegHeatmapData(result: LateRegResult, t: Translate): LateRegHeatmapData {
  const xLabels = [t('deepDive.lateReg.heatmap.bust'), ...RETURN_COLS]
  const counts: number[][] = DEPTH_BANDS.map(() => xLabels.map(() => 0))
  for (const e of result.entries) {
    counts[depthBandOf(e.stackBB)][returnColOf(e.rr + 1)]++
  }

  const bands = DEPTH_BANDS.map((band, i) => ({
    band,
    counts: counts[i],
    n: counts[i].reduce((a, b) => a + b, 0),
  })).filter(row => row.n > 0)

  const y = bands.map(row => t('deepDive.lateReg.rowLabel', { range: row.band.range, n: row.n }))
  const z = bands.map(row => row.counts.map(c => Math.sqrt(c / row.n)))
  const customdata = bands.map(row => row.counts.map(c => [c, c / row.n]))

  // Same surface as the RRE heatmap, so the two density charts read alike.
  const colorscale: [number, string][] = [
    [0, 'rgba(255, 255, 255, 0.6)'],
    [1, 'rgba(0, 0, 0, 0.6)'],
  ]
  const colorbarShares = [0.01, 0.05, 0.2, 0.5, 1]

  const traces: Data[] = [
    {
      type: 'heatmap',
      x: xLabels,
      y,
      z,
      customdata,
      colorscale,
      zmin: 0,
      zmax: 1,
      xgap: 1,
      ygap: 1,
      hovertemplate: t('deepDive.lateReg.heatmap.hover'),
      colorbar: {
        title: { text: t('deepDive.lateReg.heatmap.colorbar'), side: 'right' },
        tickvals: colorbarShares.map(s => Math.sqrt(s)),
        ticktext: colorbarShares.map(s => `${s * 100}%`),
      },
    } as unknown as Data,
  ]

  // Between the "0.5–1×" and "1–2×" columns: everything right of this line beat the buy-in.
  const breakEvenX = 3.5

  const layout: Partial<Layout> = {
    title: { text: t('deepDive.lateReg.heatmap.title') },
    height: 420,
    margin: { l: 190, r: 20, t: 70, b: 90 },
    xaxis: { title: { text: t('deepDive.lateReg.heatmap.axis.x') }, fixedrange: true },
    yaxis: { fixedrange: true, tickfont: { size: 11 } },
    shapes: [
      {
        type: 'line',
        xref: 'x',
        x0: breakEvenX,
        x1: breakEvenX,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: { color: 'rgb(140,140,140)', dash: 'dash' },
      },
    ],
    annotations: [
      {
        x: breakEvenX,
        y: 1,
        xref: 'x',
        yref: 'paper',
        text: t('deepDive.lateReg.heatmap.breakEven'),
        showarrow: false,
        xanchor: 'left',
        yanchor: 'bottom',
      },
    ],
  }

  return {
    traces,
    layout,
    caption: [
      t('deepDive.lateReg.heatmap.caption.reading'),
      t('deepDive.lateReg.heatmap.caption.scale'),
    ],
  }
}
