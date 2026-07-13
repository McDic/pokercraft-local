/**
 * Profit by hand class, for one chosen action from one chosen position.
 *
 * The drill-down the ledger cannot give you. The ledger says "defending the big blind beat
 * folding by 1.9bb on average"; this says *which hands* that average is made of — and on a
 * real 72,840-hand sample it says something the average hides:
 *
 *   Offsuit connector   +2.66 ± 1.84   beat folding
 *   Suited connector    +3.18 ± 2.77   beat folding
 *   Suited trash        −0.76 ± 2.28   inconclusive
 *
 * See handClass.ts for why this is thirteen classes and not the 169-cell grid: at this data
 * volume a 13×13 profit matrix has a *median of four hands per cell*, and Δbb is heavy
 * enough in the tails that four hands is not an estimate of anything.
 */

import type { PreflopSituation } from '../../analysis/preflopSituation'
import type { HandClass } from '../../analysis/handClass'
import { classOfHand, HAND_CLASS_ORDER } from '../../analysis/handClass'
import type { Translate, TranslationKey } from '../../i18n'
import type { DeltaFigure, DeltaRow } from './deltaFigure'
import { buildDeltaFigure, summarize } from './deltaFigure'
import type { SituationFilters } from './situationFilters'
import { passesFilters } from './situationFilters'
import { EXCLUSIONS, FAMILIES, POSITIONS } from './situationLedger'

/** Which decision to break down, and from where. `heroOffset: null` pools every position. */
export interface HandClassScope {
  familyIndex: number
  heroOffset: number | null
}

export const DEFAULT_SCOPE: HandClassScope = {
  // "Flat / defend vs. open" — the deepest bucket in a real sample, and the one whose
  // average most needs breaking apart. Pooled across positions by default, because a single
  // position divided by thirteen classes is where the sample starts to run out.
  familyIndex: FAMILIES.findIndex(f => f.key === 'chart.situation.family.flat'),
  heroOffset: null,
}

/**
 * A `Record`, not an array of pairs, so the *compiler* enforces that every class has a
 * label. An array would let a fourteenth class ship with no name, and `KEY_OF.get(c)!`
 * would render it through `t(undefined)` — the kind of hole a type can simply close.
 */
export const HAND_CLASS_KEYS: Record<HandClass, TranslationKey> = {
  pairHigh: 'chart.handClass.pairHigh',
  pairMid: 'chart.handClass.pairMid',
  pairLow: 'chart.handClass.pairLow',
  suitedBroadway: 'chart.handClass.suitedBroadway',
  suitedAce: 'chart.handClass.suitedAce',
  suitedBroadwayX: 'chart.handClass.suitedBroadwayX',
  suitedConnector: 'chart.handClass.suitedConnector',
  suitedGapper: 'chart.handClass.suitedGapper',
  suitedTrash: 'chart.handClass.suitedTrash',
  offsuitBroadway: 'chart.handClass.offsuitBroadway',
  offsuitAce: 'chart.handClass.offsuitAce',
  offsuitBroadwayX: 'chart.handClass.offsuitBroadwayX',
  offsuitConnector: 'chart.handClass.offsuitConnector',
  offsuitGapper: 'chart.handClass.offsuitGapper',
  offsuitTrash: 'chart.handClass.offsuitTrash',
}

/** Every position that can be *selected*, plus the pooled option the scope defaults to. */
export const SCOPE_POSITION_KEYS: Array<[number | null, TranslationKey]> = [
  [null, 'position.all'],
  ...POSITIONS,
]

export function buildHandClassRows(
  situations: PreflopSituation[],
  filters: SituationFilters,
  scope: HandClassScope,
  t: Translate
): {
  rows: DeltaRow[]
  hidden: number
  noCards: number
  inScope: number
  excluded: Array<{ key: TranslationKey; n: number }>
} {
  const family = FAMILIES[scope.familyIndex]
  const deltas = new Map<HandClass, number[]>()

  // Decisions this scope actually contains, whatever happens to them afterwards. Without it
  // an empty chart cannot tell you *why* it is empty — "you have squeezed from UTG six
  // times" and "you have never squeezed from UTG" look identical, and only one of them is
  // fixed by lowering the sample threshold.
  let inScope = 0

  // Hands whose hole cards could not be read. Hero's own cards are always dealt, so this
  // should be zero — but a truncated file would otherwise just quietly shrink every class.
  let noCards = 0

  // The ledger's exclusions bind here too. They have to: the two charts sit on one screen,
  // over one `situations` array, scoring the same Δbb against the same fold baseline. A
  // decision the ledger calls a category error — the big blind's iso-raise, which is chosen
  // against a *free check*, never against folding — cannot be a category error above and a
  // legitimate row below. Worse than the explicit "Iso-raise + Big blind" case is the
  // default one: pooled across positions, the excluded hands would be silently averaged in
  // with the legitimate ones and nothing on the page would say so.
  const excludedCounts = new Map<TranslationKey, number>()

  for (const s of situations) {
    if (!family?.match(s)) continue
    if (scope.heroOffset !== null && s.heroOffset !== scope.heroOffset) continue
    if (!passesFilters(s, filters)) continue

    inScope++

    const exclusion = EXCLUSIONS.find(e => e.match(s))
    if (exclusion) {
      excludedCounts.set(exclusion.key, (excludedCounts.get(exclusion.key) ?? 0) + 1)
      continue
    }

    const handClass = s.cards ? classOfHand(s.cards) : null
    if (handClass === null) {
      noCards++
      continue
    }

    const bucket = deltas.get(handClass)
    if (bucket) bucket.push(s.deltaBB)
    else deltas.set(handClass, [s.deltaBB])
  }

  // Declaration order, so the caption reads the same way every time.
  const excluded = EXCLUSIONS.flatMap(e => {
    const n = excludedCounts.get(e.key) ?? 0
    return n > 0 ? [{ key: e.key, n }] : []
  })

  const rows: DeltaRow[] = []
  let hidden = 0

  // Taxonomic order, not sorted by profit: a chart that reshuffles its rows every time you
  // change a filter is one you cannot compare against the one you were just looking at.
  for (const handClass of HAND_CLASS_ORDER) {
    const bucket = deltas.get(handClass)
    if (!bucket) continue

    const stats = summarize(bucket)
    if (stats.n < filters.minSample) {
      hidden++
      continue
    }
    rows.push({
      label: t('chart.handClass.rowLabel', {
        handClass: t(HAND_CLASS_KEYS[handClass]),
        n: stats.n,
      }),
      ...stats,
    })
  }

  return { rows, hidden, noCards, inScope, excluded }
}

export function getHandClassProfitData(
  situations: PreflopSituation[],
  filters: SituationFilters,
  scope: HandClassScope,
  t: Translate
): DeltaFigure {
  const { rows, hidden, noCards, inScope, excluded } = buildHandClassRows(
    situations,
    filters,
    scope,
    t
  )

  const family = FAMILIES[scope.familyIndex]
  const positionKey =
    SCOPE_POSITION_KEYS.find(([offset]) => offset === scope.heroOffset)?.[1] ?? 'position.all'

  const caption = [
    t('chart.handClass.caption.reading'),
    // The class names have to stay short enough to fit the row gutter, so what they *mean*
    // lives here rather than in a parenthetical on every label. A label like
    // "Suited broadway-x (K9s, Q7s…) (n=161)" nests brackets and runs off a narrow window.
    t('chart.handClass.caption.classes'),
    t('chart.handClass.caption.grid'),
    t('chart.handClass.caption.caveat'),
    // Always, not only when rows survive: it is the one number that tells an empty chart
    // apart from a chart of a thing you have never done.
    t('chart.handClass.caption.inScope', { inScope }),
  ]

  if (hidden > 0) {
    caption.push(t('chart.handClass.caption.hidden', { hidden }))
  }

  // Why the rows are missing, in the same words the ledger uses. Skipping them silently
  // would trade a wrong chart for an unexplained blank one — the same absence this whole
  // mechanism exists to prevent.
  for (const { key, n } of excluded) {
    caption.push(t('chart.situation.caption.excluded', { n, reason: t(key) }))
  }

  if (noCards > 0) {
    caption.push(t('chart.handClass.caption.noCards', { noCards }))
  }

  return buildDeltaFigure(
    rows,
    {
      title: t('chart.handClass.title', {
        family: family ? t(family.key) : '',
        position: t(positionKey),
      }),
      caption,
      // Class names are far shorter than "Call vs. 4-bet · MP+1 (n=1234)".
      leftMargin: 210,
    },
    t
  )
}
