/**
 * The situation ledger: what each preflop decision paid, against folding.
 *
 * Rows are (action × your position). The figure itself — two panels, the significance
 * colouring, the fold-baseline zero — lives in deltaFigure.ts, shared with the hand-class
 * chart beside it.
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

import type { PreflopSituation } from '../../analysis/preflopSituation'
import type { Translate, TranslationKey } from '../../i18n'
import type { DeltaFigure, DeltaRow } from './deltaFigure'
import { buildDeltaFigure, summarize } from './deltaFigure'
import type { SituationFilters } from './situationFilters'
import { passesFilters } from './situationFilters'

export interface Family {
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
export const FAMILIES: Family[] = [
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

export const POSITIONS: Array<[number, TranslationKey]> = [
  [-5, 'position.utg'],
  [-4, 'position.utg1'],
  [-3, 'position.mp'],
  [-2, 'position.mp1'],
  [-1, 'position.co'],
  [0, 'position.btn'],
  [1, 'position.sb'],
  [2, 'position.bb'],
]

export function buildLedgerRows(
  situations: PreflopSituation[],
  filters: SituationFilters,
  t: Translate
): { rows: DeltaRow[]; hidden: number } {
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

  const rows: DeltaRow[] = []
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
  filters: SituationFilters,
  t: Translate,
  /** From `Classification`. Surfaced in the caption, never swallowed. */
  droppedHands = 0
): DeltaFigure {
  const { rows, hidden } = buildLedgerRows(situations, filters, t)

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

  // Say out loud what the default view is doing. A position is a different seat at a
  // different table size — heads-up puts the button *on* the small blind — so with no
  // table filter the SB and BB rows blend an HU steal into a full-ring open. That is a
  // legitimate "show me everything" default, but only if the reader knows it is happening.
  if (filters.tableBucket === 'any') {
    caption.push(t('chart.situation.ledger.caption.tablePooled'))
  }

  if (hidden > 0) {
    caption.push(t('chart.situation.ledger.caption.hidden', { hidden }))
  }
  if (droppedHands > 0) {
    caption.push(t('chart.situation.ledger.caption.dropped', { droppedHands }))
  }

  return buildDeltaFigure(
    rows,
    { title: t('chart.situation.ledger.title'), caption, leftMargin: 300 },
    t
  )
}
