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
 * Thirteen, chosen to be the coarsest split that still separates hands you would play
 * differently: pairs by height, then suited and offsuit each split into broadway, ace-x,
 * connector, gapper, and trash. Ordering is taxonomic (pairs, suited, offsuit) rather than
 * by strength, so the chart is stable whatever the data says.
 */

import type { CardString } from '../types'

export type HandClass =
  | 'pairHigh'
  | 'pairMid'
  | 'pairLow'
  | 'suitedBroadway'
  | 'suitedAce'
  | 'suitedConnector'
  | 'suitedGapper'
  | 'suitedTrash'
  | 'offsuitBroadway'
  | 'offsuitAce'
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
 * Order of tests matters: broadway is checked before connector and before ace-x, so KQs is
 * a suited broadway rather than a suited connector, and AKs is a broadway rather than an
 * ace-x. Every hand lands in exactly one class — asserted over all 1326 combinations.
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
  const broadway = low >= TEN // both cards ten or better
  const gap = high - low

  if (suited) {
    if (broadway) return 'suitedBroadway'
    if (high === ACE) return 'suitedAce'
    if (gap === 1) return 'suitedConnector'
    if (gap <= 3) return 'suitedGapper'
    return 'suitedTrash'
  }

  if (broadway) return 'offsuitBroadway'
  if (high === ACE) return 'offsuitAce'
  if (gap === 1) return 'offsuitConnector'
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
  'suitedConnector',
  'suitedGapper',
  'suitedTrash',
  'offsuitBroadway',
  'offsuitAce',
  'offsuitConnector',
  'offsuitGapper',
  'offsuitTrash',
]
