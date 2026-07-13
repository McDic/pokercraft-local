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
import { FAMILIES, POSITIONS } from './situationLedger'

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

export const HAND_CLASS_KEYS: Array<[HandClass, TranslationKey]> = [
  ['pairHigh', 'chart.handClass.pairHigh'],
  ['pairMid', 'chart.handClass.pairMid'],
  ['pairLow', 'chart.handClass.pairLow'],
  ['suitedBroadway', 'chart.handClass.suitedBroadway'],
  ['suitedAce', 'chart.handClass.suitedAce'],
  ['suitedConnector', 'chart.handClass.suitedConnector'],
  ['suitedGapper', 'chart.handClass.suitedGapper'],
  ['suitedTrash', 'chart.handClass.suitedTrash'],
  ['offsuitBroadway', 'chart.handClass.offsuitBroadway'],
  ['offsuitAce', 'chart.handClass.offsuitAce'],
  ['offsuitConnector', 'chart.handClass.offsuitConnector'],
  ['offsuitGapper', 'chart.handClass.offsuitGapper'],
  ['offsuitTrash', 'chart.handClass.offsuitTrash'],
]

const KEY_OF = new Map(HAND_CLASS_KEYS)

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
): { rows: DeltaRow[]; hidden: number; noCards: number } {
  const family = FAMILIES[scope.familyIndex]
  const deltas = new Map<HandClass, number[]>()

  // Hands whose hole cards the history never showed. Hero's own cards are always dealt, so
  // this should be zero — but if a file is ever truncated mid-hand it would silently shrink
  // every class, so it is counted rather than assumed.
  let noCards = 0

  for (const s of situations) {
    if (!family?.match(s)) continue
    if (scope.heroOffset !== null && s.heroOffset !== scope.heroOffset) continue
    if (!passesFilters(s, filters)) continue

    if (!s.cards) {
      noCards++
      continue
    }
    const handClass = classOfHand(s.cards)
    if (handClass === null) {
      noCards++
      continue
    }

    const bucket = deltas.get(handClass)
    if (bucket) bucket.push(s.deltaBB)
    else deltas.set(handClass, [s.deltaBB])
  }

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
        handClass: t(KEY_OF.get(handClass)!),
        n: stats.n,
      }),
      ...stats,
    })
  }

  return { rows, hidden, noCards }
}

export function getHandClassProfitData(
  situations: PreflopSituation[],
  filters: SituationFilters,
  scope: HandClassScope,
  t: Translate
): DeltaFigure {
  const { rows, hidden, noCards } = buildHandClassRows(situations, filters, scope, t)

  const family = FAMILIES[scope.familyIndex]
  const positionKey =
    SCOPE_POSITION_KEYS.find(([offset]) => offset === scope.heroOffset)?.[1] ?? 'position.all'

  const caption = [
    t('chart.handClass.caption.reading'),
    t('chart.handClass.caption.grid'),
    t('chart.handClass.caption.caveat'),
  ]

  if (hidden > 0) {
    caption.push(t('chart.handClass.caption.hidden', { hidden }))
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
