/**
 * The situation tab's controls, described once and rendered twice.
 *
 * There are two renderers: the React filter bar in `SituationCharts.tsx`, and the plain-DOM
 * one in `export/situationRuntime.ts` that ships inside the downloaded HTML. They cannot share
 * a *rendering* — one emits JSX, the other calls `createElement` — but that difference is
 * inert. If it is wrong, nothing appears.
 *
 * What they must not have twice is the **meaning** of a control: its options, and what
 * changing it does to the state. That is what this file holds. Before it existed, each
 * dropdown's reducer was written out on both sides —
 *
 *     setFilters(f => ({ ...f, stackBucket: e.target.value as StackBucket | 'any' }))   // React
 *     filters = { ...filters, stackBucket: value as StackBucket | 'any' }               // export
 *
 * — and two copies of a reducer is how the exported file ends up filtering *slightly*
 * differently from the app it was exported out of. Nothing about that failure looks broken:
 * both pages draw a chart, and only one of them is the chart you asked for.
 *
 * So a control is data. A renderer may only lay it out.
 */

import type { OpenerBucket } from '../../analysis/preflopSituation'
import type { Translate, TranslationKey } from '../../i18n'
import type { HandClassScope } from './handClassProfit'
import { SCOPE_POSITION_KEYS } from './handClassProfit'
import type { SituationFilters, StackBucket, TableBucket } from './situationFilters'
import {
  MIN_SAMPLE_CHOICES,
  OPENER_BUCKET_KEYS,
  STACK_BUCKET_KEYS,
  TABLE_BUCKET_KEYS,
} from './situationFilters'
import { FAMILIES } from './situationLedger'

/** One `<select>`: what it is called, what it offers, and what picking an option means. */
export interface Control<S> {
  /** Stable across renders and languages — React needs a key, and tests need a name. */
  id: string
  labelKey: TranslationKey
  /** `[value, label]`. The value is what a `<select>` round-trips, so it is always a string. */
  options: (t: Translate) => Array<[value: string, label: string]>
  /** The option currently selected, as its value. */
  valueOf: (state: S) => string
  /** The state after picking `value`. The single definition of what this control *does*. */
  apply: (state: S, value: string) => S
}

/** The one option that is not a bucket: "don't narrow by this at all". */
const ANY = 'any'

function anyOption(t: Translate): [string, string] {
  return [ANY, t('chart.situation.filter.any')]
}

/**
 * A bucket dropdown: "Any", then one option per bucket.
 *
 * The cast in `apply` is checked by the option list it is paired with — `keys` enumerates
 * every member of `B`, so the only values a `<select>` can hand back are those or `ANY`. It is
 * the narrowest place to put it, and it is written once instead of once per filter.
 */
function bucketControl<S, B extends string>(
  id: string,
  labelKey: TranslationKey,
  keys: Array<[B, TranslationKey]>,
  valueOf: (state: S) => B | typeof ANY,
  apply: (state: S, bucket: B | typeof ANY) => S
): Control<S> {
  return {
    id,
    labelKey,
    options: t => [anyOption(t), ...keys.map(([bucket, key]): [string, string] => [bucket, t(key)])],
    valueOf,
    apply: (state, value) => apply(state, value as B | typeof ANY),
  }
}

export const FILTER_CONTROLS: Array<Control<SituationFilters>> = [
  bucketControl<SituationFilters, OpenerBucket>(
    'opener',
    'chart.situation.filter.opener',
    OPENER_BUCKET_KEYS,
    f => f.openerBucket,
    (f, openerBucket) => ({ ...f, openerBucket })
  ),
  bucketControl<SituationFilters, StackBucket>(
    'stack',
    'chart.situation.filter.stack',
    STACK_BUCKET_KEYS,
    f => f.stackBucket,
    (f, stackBucket) => ({ ...f, stackBucket })
  ),
  bucketControl<SituationFilters, TableBucket>(
    'table',
    'chart.situation.filter.table',
    TABLE_BUCKET_KEYS,
    f => f.tableBucket,
    (f, tableBucket) => ({ ...f, tableBucket })
  ),
  {
    id: 'minSample',
    labelKey: 'chart.situation.filter.minSample',
    // A count, not a category: it names itself in every language.
    options: () => MIN_SAMPLE_CHOICES.map((n): [string, string] => [String(n), String(n)]),
    valueOf: f => String(f.minSample),
    apply: (f, value) => ({ ...f, minSample: Number(value) }),
  },
]

/**
 * The class chart's own two controls.
 *
 * Kept apart from the filters because they are not filters: they do not narrow the data, they
 * choose *which row of the ledger to open up*. Both renderers rely on that split — the ledger
 * does not depend on the scope, so changing one of these must not rebuild it.
 */
export const SCOPE_CONTROLS: Array<Control<HandClassScope>> = [
  {
    id: 'action',
    labelKey: 'chart.handClass.filter.action',
    options: t => FAMILIES.map((family, i): [string, string] => [String(i), t(family.key)]),
    valueOf: s => String(s.familyIndex),
    apply: (s, value) => ({ ...s, familyIndex: Number(value) }),
  },
  {
    id: 'position',
    labelKey: 'chart.handClass.filter.position',
    options: t =>
      SCOPE_POSITION_KEYS.map(([offset, key]): [string, string] => [
        offset === null ? ANY : String(offset),
        t(key),
      ]),
    // `null` is the pooled "every position" scope, and it shares the wire value with the
    // filters' "Any" — both mean "do not split by this".
    valueOf: s => (s.heroOffset === null ? ANY : String(s.heroOffset)),
    apply: (s, value) => ({ ...s, heroOffset: value === ANY ? null : Number(value) }),
  },
]
