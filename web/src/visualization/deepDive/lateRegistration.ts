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
    // the widest row label, the Korean "늦은 등록, 남은 스택 60–100 BB (n=…)".
    { title: '', caption: [], leftMargin: 230, keys: KEYS },
    t
  )
}
