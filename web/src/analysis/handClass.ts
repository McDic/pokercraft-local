/**
 * Starting hands, grouped into the classes a decision is actually made over.
 *
 * ## Why classes and not the 169-cell grid
 *
 * The obvious chart here is the 13×13 preflop matrix, coloured by profit. It does not
 * work, and the reason is worth writing down so nobody rebuilds it.
 *
 * A 13×13 grid slices a bucket into 169 cells. On a real 72,840-hand session, "3-bet vs.
 * open · CO" is 322 decisions — a *median of 4 hands per cell*, and exactly one cell in
 * 169 reaching n=30. "Open raise · BTN" is 881 decisions and reaches n=30 in **zero**
 * cells. Δbb is heavy-tailed — one cracked ace moves a cell by fifty big blinds — so a
 * cell of four hands carries no information whatsoever about profit, and a diverging
 * colourscale would render that non-information in confident red and blue. The grid needs
 * something like 20-30× more hands before it says anything.
 *
 * Classes are the same question at a resolution the data can answer. The same BB-defence
 * bucket that gives 7 hands per cell gives 60-231 per class, which is enough for a real
 * interval: suited connectors and offsuit connectors come out clearly ahead of folding,
 * suited trash clearly behind. That is the finding; `K7o` versus `K6o` is not.
 *
 * Frequency would survive the 169-cell split — a rate converges far faster than a
 * heavy-tailed mean — which is exactly why the VPIP heatmap can be a grid and this cannot.
 *
 * ## The classes
 *
 * Fifteen, chosen to be the coarsest split that still separates hands you would play
 * differently: pairs by height, then suited and offsuit each split into broadway, ace-x,
 * broadway-x, connector, gapper, and trash.
 *
 * **`broadway-x` is why there are fifteen and not thirteen.** A purely gap-based split puts
 * K9s four ranks apart and therefore in "trash" — next to 72s. That fails the module's own
 * criterion, and it fails it in the direction that misleads: the "trash" row would be 36
 * hands whose *mass* is K-x and Q-x, so a reader seeing it break even would conclude their
 * trash defences are fine and start flatting 92s. The ace already had a class of its own;
 * the king fell off a cliff. So a hand with exactly one broadway card and no connection is
 * its own thing, and gapper/trash now mean what they say: no broadway card at all. Suited
 * trash is now 95s-72s — ten hands, and every one of them is genuinely trash.
 *
 * Connectors are tested *before* broadway-x so that T9s stays a suited connector, which is
 * what it is, rather than becoming a ten-with-a-low-card.
 *
 * Ordering is taxonomic (pairs, suited, offsuit) rather than by strength, so the chart is
 * stable whatever the data says.
 */

import type { CardString } from '../types'

export type HandClass =
  | 'pairHigh'
  | 'pairMid'
  | 'pairLow'
  | 'suitedBroadway'
  | 'suitedAce'
  | 'suitedBroadwayX'
  | 'suitedConnector'
  | 'suitedGapper'
  | 'suitedTrash'
  | 'offsuitBroadway'
  | 'offsuitAce'
  | 'offsuitBroadwayX'
  | 'offsuitConnector'
  | 'offsuitGapper'
  | 'offsuitTrash'

/** Ace high, deuce low — so "broadway" is simply a floor, and "gap" is a subtraction. */
const ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const RANK = new Map(ORDER.map((r, i) => [r, i]))

const ACE = RANK.get('A')!
const TEN = RANK.get('T')!

function rankOf(card: CardString): number {
  return RANK.get(card[0]) ?? -1
}

/**
 * The class a hand belongs to, or null if the cards cannot be read.
 *
 * The order of the tests *is* the taxonomy, and every one of them is load-bearing:
 *
 *   both broadway  before everything — AKs and KQs are broadway, not ace-x or connectors
 *   ace-x          before connector  — A5s is a suited ace, not a gapper
 *   connector      before broadway-x — T9s is a suited connector, not a ten-with-a-nine
 *   broadway-x     before gapper     — K9s is a king-x, not trash; Q9s is not a gapper
 *
 * Every hand lands in exactly one class, and every class is reachable — both asserted over
 * all 1326 combinations.
 */
export function classOfHand(cards: [CardString, CardString]): HandClass | null {
  const [a, b] = cards
  const ra = rankOf(a)
  const rb = rankOf(b)
  if (ra < 0 || rb < 0) return null

  const high = Math.max(ra, rb)
  const low = Math.min(ra, rb)

  if (high === low) {
    if (high >= TEN) return 'pairHigh' // TT+
    if (high >= RANK.get('6')!) return 'pairMid' // 66-99
    return 'pairLow' // 22-55
  }

  const suited = a[1] === b[1]
  const bothBroadway = low >= TEN
  /** Exactly one broadway card, the other below it — K9s, Q7s, T4s. */
  const oneBroadway = high >= TEN
  const gap = high - low

  if (suited) {
    if (bothBroadway) return 'suitedBroadway'
    if (high === ACE) return 'suitedAce'
    if (gap === 1) return 'suitedConnector'
    if (oneBroadway) return 'suitedBroadwayX'
    if (gap <= 3) return 'suitedGapper'
    return 'suitedTrash'
  }

  if (bothBroadway) return 'offsuitBroadway'
  if (high === ACE) return 'offsuitAce'
  if (gap === 1) return 'offsuitConnector'
  if (oneBroadway) return 'offsuitBroadwayX'
  if (gap <= 3) return 'offsuitGapper'
  return 'offsuitTrash'
}

/** Display order: taxonomic, so the chart does not reshuffle when the data changes. */
export const HAND_CLASS_ORDER: HandClass[] = [
  'pairHigh',
  'pairMid',
  'pairLow',
  'suitedBroadway',
  'suitedAce',
  'suitedBroadwayX',
  'suitedConnector',
  'suitedGapper',
  'suitedTrash',
  'offsuitBroadway',
  'offsuitAce',
  'offsuitBroadwayX',
  'offsuitConnector',
  'offsuitGapper',
  'offsuitTrash',
]
