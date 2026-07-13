/**
 * Preflop situations, and what each one actually paid.
 *
 * A "situation" is one *decision* Hero faced preflop: the state of the action when it
 * reached them, what they did, and how the hand finished. Hero can face more than one in
 * a hand — opening from CO and then facing a 3-bet are two separate decisions, and both
 * are worth judging — so a hand yields a *list* of situations, one per voluntary action.
 *
 * ## The metric: Δbb
 *
 * Folding is not worth zero. It forfeits whatever you have already put in, so measured as
 * raw profit every blind-defence bucket comes out negative for reasons that have nothing
 * to do with how well the hand was played, and no honest comparison against an open-raise
 * bucket is possible. So each decision is scored against the only baseline that makes it
 * comparable — folding *right there*:
 *
 *     Δ = net result − (result of folding at this node)
 *       = net result − (−committed so far)
 *       = net result + committed so far
 *
 * which collapses to
 *
 *     Δ = collected − (chips Hero *chose* to put in, from this node onward)
 *
 * The antes and blinds cancel exactly. That is what makes the metric safe: it needs no
 * knowledge of the ante structure (uniform, big-blind, or none), only Hero's own posts,
 * and it is not some new derived quantity that could quietly be wrong — within any one
 * bucket it is raw profit shifted by a constant. All it does is move the zero, and moving
 * the zero is the whole point: Δ > 0 means the action beat folding.
 *
 * It follows that **folding always scores exactly 0**, at every node. That identity is the
 * load-bearing test in preflopSituation.test.ts; if the parser or this file ever
 * miscounts a chip, it breaks there rather than in a chart.
 *
 * ## Δ is per-decision, and does not add up to your profit
 *
 * Two consequences of scoring *decisions* rather than *hands*, both of which look like
 * bugs and are not:
 *
 * 1. **Never sum Δ across the nodes of one hand.** Every node of a hand is scored against
 *    the same final result, so a hand where Hero opens and then folds to a 3-bet
 *    contributes that result to *both* nodes. Each answer is right on its own — opening
 *    and surrendering cost 2.5bb; folding once 3-bet cost nothing — but they are answers
 *    to different questions and adding them is meaningless. Aggregate within a bucket,
 *    where each hand appears at most once, never across buckets.
 *
 * 2. **Total Δ exceeds raw profit, and should.** Raw profit carries every blind and ante
 *    Hero ever posted and folded; Δ does not, because folding was not a decision Hero
 *    could have avoided paying for. On a real 6.5k-hand sample the gap is most of a
 *    thousand big blinds. A grand total across the chart is therefore not a bankroll and
 *    must not be presented as one.
 *
 * Two things Δ is not: it is chip EV, not $EV (no ICM), and it contains Hero's postflop
 * play — a losing bucket may be a bad call *or* a well-judged call played badly after the
 * flop. Both belong in the chart's caption, not in this file.
 */

import type { BetAction, CardString, HandHistory } from '../types'
import {
  getHandHistoryInitialChips,
  getHandHistoryNetProfit,
  getHandHistoryOffsetFromButton,
} from '../types'
import { yieldToBrowser } from '../utils'

/** The parser names the importing player literally; there is no hero field to consult. */
export const HERO = 'Hero'

/** How the action stood when it reached Hero. */
export type PreflopContext =
  /** Folded to Hero. */
  | 'unopened'
  /** Limps only, no raise. */
  | 'limped'
  /** One raise, nobody behind it. */
  | 'raised'
  /** One raise and at least one caller — Hero is looking at a squeeze spot. */
  | 'raisedCalled'
  /** Two raises: Hero is facing a 3-bet. */
  | 'threeBet'
  /** Three or more raises. */
  | 'fourBetPlus'

/** What Hero did. Mirrors BetActionType minus the posts and minus `bet` — see `classifyHand`. */
export type HeroPreflopAction = 'fold' | 'check' | 'call' | 'raise'

/**
 * The raiser Hero is facing, collapsed to a bucket.
 *
 * Splitting by the villain's exact seat multiplies the buckets sixfold and buys nothing:
 * the samples vanish long before the distinctions become real. Four buckets keep
 * "3-bet against an early open" answerable.
 */
export type OpenerBucket = 'ep' | 'mp' | 'lp' | 'blinds'

export interface PreflopSituation {
  context: PreflopContext
  action: HeroPreflopAction
  /** Hero's action was all-in — an open-jam when `context` is `unopened`. */
  allIn: boolean
  /** Offset from the button, clamped at -5 so 9-max UTG/UTG+1 share a bucket (as the VPIP heatmap does). */
  heroOffset: number
  openerBucket: OpenerBucket | null
  /** Size Hero is facing, as a multiple of the big blind ("did I call a 3bb open?"). */
  raiseToBB: number | null
  /** Hero's starting stack. In tournaments this governs which decisions are even available. */
  heroStackBB: number
  /**
   * How many players were dealt in.
   *
   * A button offset means a different game at a different table size: heads-up puts the
   * button *on* the small blind, so an HU steal and a 6-max SB open land on the same
   * offset and would otherwise be averaged together. Carried so the ledger can separate
   * them — see `tableBucketOf`.
   */
  tableSize: number
  /** Profit relative to folding at this node, in big blinds. Zero for every fold. */
  deltaBB: number
  cards: [CardString, CardString] | null
}

const VOLUNTARY = new Set<BetAction['action']>(['fold', 'check', 'call', 'raise'])

/** Everything from UTG back folds into one bucket; the tail is too thin to split. */
function clampOffset(offset: number): number {
  return offset <= -5 ? -5 : offset
}

export function toOpenerBucket(offset: number): OpenerBucket {
  if (offset === 1 || offset === 2) return 'blinds'
  if (offset === 0 || offset === -1) return 'lp'
  if (offset === -2 || offset === -3) return 'mp'
  return 'ep'
}

function contextOf(raises: number, callers: number): PreflopContext {
  if (raises === 0) return callers === 0 ? 'unopened' : 'limped'
  if (raises === 1) return callers === 0 ? 'raised' : 'raisedCalled'
  if (raises === 2) return 'threeBet'
  return 'fourBetPlus'
}

/**
 * Every preflop decision Hero faced in one hand, scored.
 *
 * Returns `[]` when Hero never got a decision — a walk in the big blind, or a blind that
 * was itself all-in. Both would otherwise land in the BB bucket as free money that no
 * choice of Hero's produced.
 */
export function classifyHand(h: HandHistory): PreflopSituation[] {
  // A preflop `bet` is not a thing GG writes — preflop money moves as blind, call or
  // raise — but the parser's action regex would accept one on any street, and this walk
  // has no coherent reading for it: `bet` carries an increment where `raise` carries a
  // *to* total, so there is no way to know what it did to the betting level. Rather than
  // guess and desync Hero's commitment from getHandHistoryTotalChipsPut — which would put
  // a nonzero Δ on every later node of the hand, folds included, and quietly break the one
  // identity this module rests on — drop the hand. An empty chart is a visible failure; a
  // subtly wrong one is not.
  if (h.actionsPreflop.some(a => a.action === 'bet')) return []

  let heroOffset: number
  let heroStackBB: number
  try {
    heroOffset = clampOffset(getHandHistoryOffsetFromButton(h, HERO))
    heroStackBB = getHandHistoryInitialChips(h, HERO) / h.bb
  } catch {
    return [] // Hero is not seated in this hand.
  }

  const net = getHandHistoryNetProfit(h, HERO)
  const cards = h.knownCards.get(HERO) ?? null

  // State of the action as we walk it, up to whatever point Hero is about to act.
  let raises = 0
  let callers = 0 // since the last raise, so a squeeze is distinguishable from a plain 3-bet
  let lastRaiser: string | null = null
  let lastRaiseTo: number | null = null

  // Hero's own commitment, tracked with the same semantics as getHandHistoryTotalChipsPut:
  // antes stand outside the street, `call` adds, and `raise` carries a *to* total that
  // replaces the street commitment rather than adding to it.
  let heroAnte = 0
  let heroStreetCommit = 0

  const situations: PreflopSituation[] = []

  for (const a of h.actionsPreflop) {
    const isHero = a.playerId === HERO

    if (!VOLUNTARY.has(a.action)) {
      // An ante or a blind — the `bet` case is gone by the guard above. It buys Hero no
      // decision, but it is exactly what folding would have cost them.
      if (isHero) {
        if (a.action === 'ante') heroAnte += a.amount
        else heroStreetCommit += a.amount
      }
      continue
    }

    if (isHero) {
      const committedBefore = heroAnte + heroStreetCommit
      const openerOffset = lastRaiser === null ? null : offsetOrNull(h, lastRaiser)

      situations.push({
        context: contextOf(raises, callers),
        action: a.action as HeroPreflopAction,
        allIn: a.isAllIn,
        heroOffset,
        openerBucket: openerOffset === null ? null : toOpenerBucket(openerOffset),
        raiseToBB: lastRaiseTo === null ? null : lastRaiseTo / h.bb,
        heroStackBB,
        tableSize: h.seats.size,
        // Folding here would have returned −committedBefore, so this is the gain over folding.
        deltaBB: (net + committedBefore) / h.bb,
        cards,
      })
    }

    switch (a.action) {
      case 'call':
        if (isHero) heroStreetCommit += a.amount
        else callers++
        break
      case 'raise':
        if (isHero) {
          heroStreetCommit = a.amount
        } else {
          lastRaiser = a.playerId
          lastRaiseTo = a.amount
        }
        raises++
        callers = 0
        break
      case 'fold':
      case 'check':
        break
    }
  }

  return situations
}

/** Position of a villain, or null where the seat walk cannot place them. */
function offsetOrNull(h: HandHistory, playerId: string): number | null {
  try {
    return clampOffset(getHandHistoryOffsetFromButton(h, playerId))
  } catch {
    return null
  }
}

/**
 * Classify a whole session.
 *
 * Done once and memoized by the caller: every dropdown in the situation charts is then a
 * filter over this array rather than another pass over the hand histories.
 */
export async function classifyHandHistories(
  handHistories: HandHistory[]
): Promise<PreflopSituation[]> {
  const all: PreflopSituation[] = []
  for (let i = 0; i < handHistories.length; i++) {
    all.push(...classifyHand(handHistories[i]))
    if ((i + 1) % 1000 === 0) {
      await yieldToBrowser()
    }
  }
  return all
}
