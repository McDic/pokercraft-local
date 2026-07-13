/**
 * What an exported situation chart carries: the decisions, not the answers.
 *
 * ## Why the decisions
 *
 * The exported file has live filter dropdowns, so it needs to be able to *re-aggregate* —
 * and there are two ways to give it that. Precomputing every answer is the obvious one, and
 * it does not survive contact with the arithmetic. The filters alone are cheap (opener × stack
 * × table = 100 combinations, and `minSample` only hides rows, so it does not multiply). But
 * the hand-class chart also has a **scope** — 12 actions × 9 positions = 108 — and scope
 * multiplies with the filters: 10,800 distinct charts, each 15 classes wide. That is ~6.5M
 * numbers, on the order of 60MB, for a page that draws two figures at a time.
 *
 * Shipping the decisions instead costs 0.65MB on a real 72,840-hand corpus, re-aggregates in
 * a few milliseconds, and makes *every* combination reachable rather than only the ones
 * someone thought to precompute. It is both the smaller and the more capable choice, which is
 * unusual enough to write down.
 *
 * ## Folds are not shipped
 *
 * 58,582 of the 75,355 decisions in that corpus are folds — 78% of the payload — and not one
 * of them can ever become a row: Δ is *defined* as profit relative to folding, so a fold
 * scores exactly 0 and `buildLedgerRows` skips it (`familyIndex < 0`), as does
 * `buildHandClassRows` (no family matches). Dropping them is most of the size win and costs
 * nothing that either chart can show. Anything added later that *does* need folds must extend
 * this format rather than assume they are here.
 *
 * ## Nothing is rounded
 *
 * Floats go over the wire at full precision, which costs about 0.2MB against a 6-decimal
 * encoding. It buys a claim worth more than the bytes: the exported chart is not *close to*
 * the one on screen, it is **the same chart** — same data, same code, same numbers. A rounded
 * wire format would have made that "identical to within 1e-6", which is true, harmless, and an
 * argument I would have to win again every time someone read the code. `situationRuntime.test`
 * asserts plain equality between the app's figure and the download's, and that assertion is
 * only available at full precision.
 */

import type {
  HeroPreflopAction,
  OpenerBucket,
  PreflopContext,
  PreflopSituation,
} from '../analysis/preflopSituation'
import type { HandClassScope } from '../visualization/handHistory/handClassProfit'
import type { SituationFilters } from '../visualization/handHistory/situationFilters'

/**
 * One decision, packed positionally.
 *
 * A tuple rather than an object because the key names would be two thirds of the bytes on the
 * wire. The order is the contract; `packSituation` and `unpackSituation` are its only two
 * readers, and a round-trip test over the real field space pins them together.
 */
export type PackedSituation = [
  context: number,
  action: number,
  allIn: 0 | 1,
  heroOffset: number,
  /** -1 for null: there was no raise to attribute a position to. */
  openerBucket: number,
  raiseToBB: number | null,
  heroStackBB: number,
  tableSize: number,
  deltaBB: number,
  card1: string | null,
  card2: string | null,
]

export interface SituationExport {
  /** Every non-fold decision. See the module note on why folds are absent. */
  rows: PackedSituation[]
  /** The filter and scope state the file opens in — whatever was on screen at export. */
  filters: SituationFilters
  scope: HandClassScope
  /**
   * Every translation key, already resolved for the export's language over the English
   * fallback. The whole dictionary rather than the keys the charts happen to use today: it is
   * ~30KB against a 650KB payload, and enumerating them is a list that would silently fall
   * behind the code and leave a raw `chart.situation.family.squeeze` in the exported file.
   */
  strings: Record<string, string>
  droppedHands: number
}

/**
 * The codes are `Record`s over the union, so the compiler refuses a new context, action or
 * opener bucket that has no wire representation — and the decode tables are *inverted from*
 * these rather than written out again, so the two can never disagree.
 */
const CONTEXT_CODES: Record<PreflopContext, number> = {
  unopened: 0,
  limped: 1,
  raised: 2,
  raisedCalled: 3,
  threeBet: 4,
  fourBetPlus: 5,
}

const ACTION_CODES: Record<HeroPreflopAction, number> = {
  fold: 0,
  check: 1,
  call: 2,
  raise: 3,
}

const OPENER_CODES: Record<OpenerBucket, number> = {
  ep: 0,
  mp: 1,
  lp: 2,
  blinds: 3,
}

function invert<K extends string>(codes: Record<K, number>): K[] {
  const names: K[] = []
  for (const [name, code] of Object.entries(codes) as Array<[K, number]>) {
    names[code] = name
  }
  return names
}

const CONTEXT_NAMES = invert(CONTEXT_CODES)
const ACTION_NAMES = invert(ACTION_CODES)
const OPENER_NAMES = invert(OPENER_CODES)

export function packSituation(s: PreflopSituation): PackedSituation {
  return [
    CONTEXT_CODES[s.context],
    ACTION_CODES[s.action],
    s.allIn ? 1 : 0,
    s.heroOffset,
    s.openerBucket === null ? -1 : OPENER_CODES[s.openerBucket],
    s.raiseToBB,
    s.heroStackBB,
    s.tableSize,
    s.deltaBB,
    s.cards?.[0] ?? null,
    s.cards?.[1] ?? null,
  ]
}

export function unpackSituation(p: PackedSituation): PreflopSituation {
  const [context, action, allIn, heroOffset, opener, raiseToBB, heroStackBB, tableSize, deltaBB, card1, card2] =
    p
  return {
    context: CONTEXT_NAMES[context],
    action: ACTION_NAMES[action],
    allIn: allIn === 1,
    heroOffset,
    openerBucket: opener === -1 ? null : OPENER_NAMES[opener],
    raiseToBB,
    heroStackBB,
    tableSize,
    deltaBB,
    cards: card1 !== null && card2 !== null ? [card1, card2] : null,
  }
}

/**
 * The decisions worth exporting: everything that is not a fold.
 *
 * Named rather than inlined at the call site so that the reason travels with it. A fold scores
 * exactly zero by construction and cannot become a row in either chart, so it is 78% of the
 * payload and 0% of the picture.
 */
export function exportableSituations(situations: PreflopSituation[]): PackedSituation[] {
  return situations.filter(s => s.action !== 'fold').map(packSituation)
}
