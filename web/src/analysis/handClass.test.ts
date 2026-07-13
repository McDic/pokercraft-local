/**
 * The classes have to *partition* the deck: every one of the 1326 two-card combinations
 * lands in exactly one, and none is unreachable.
 *
 * This is the same shape of guard as the ledger's family-coverage test, and for the same
 * reason. A hand that matched no class would be computed, correct, and then silently
 * dropped from every bucket — an absence, which is the one defect a chart cannot show you.
 */

import { describe, it, expect } from 'vitest'
import type { CardString } from '../types'
import { classOfHand, HAND_CLASS_ORDER } from './handClass'
import type { HandClass } from './handClass'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['s', 'h', 'd', 'c']

/** All 1326 distinct two-card combinations. */
function everyCombo(): Array<[CardString, CardString]> {
  const deck: CardString[] = RANKS.flatMap(r => SUITS.map(s => `${r}${s}` as CardString))
  const out: Array<[CardString, CardString]> = []
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) out.push([deck[i], deck[j]])
  }
  return out
}

describe('classOfHand', () => {
  const combos = everyCombo()

  it('has a deck of 1326 combinations to classify', () => {
    expect(combos).toHaveLength(1326)
  })

  it('puts every combination in exactly one class', () => {
    const unclassified = combos.filter(c => classOfHand(c) === null)
    expect(unclassified).toEqual([])
  })

  it('leaves no class unreachable', () => {
    const seen = new Set(combos.map(classOfHand))
    const orphans = HAND_CLASS_ORDER.filter(c => !seen.has(c))
    expect(orphans).toEqual([])
  })

  it('emits no class that HAND_CLASS_ORDER does not list', () => {
    // The direction that silently loses hands. `buildHandClassRows` iterates
    // HAND_CLASS_ORDER, so a class the classifier emits but the order omits is bucketed and
    // then never read: it vanishes from the chart with no `hidden` count and no `noCards`
    // count, and every other test stays green. An absence, again — the one defect a chart
    // cannot show you.
    const listed = new Set<string>(HAND_CLASS_ORDER)
    const unlisted = [...new Set(combos.map(classOfHand))].filter(c => c !== null && !listed.has(c))
    expect(unlisted).toEqual([])
  })

  it('does not put a king next to a seven-deuce', () => {
    // The bug this taxonomy was rewritten to fix. A purely gap-based split makes K9s four
    // ranks apart and therefore "trash", sitting in the same row as 72s — so the row's mass
    // is K-x and Q-x, and a reader seeing it break even concludes their trash defences are
    // fine and starts flatting 92s.
    expect(classOfHand(['Kh', '9h'])).toBe('suitedBroadwayX')
    expect(classOfHand(['Qh', '7h'])).toBe('suitedBroadwayX')
    expect(classOfHand(['Th', '4h'])).toBe('suitedBroadwayX')
    expect(classOfHand(['Kh', '9d'])).toBe('offsuitBroadwayX')

    // Trash now means what it says: no broadway card at all.
    const trash = combos.filter(c => classOfHand(c) === 'suitedTrash')
    const hasBroadway = trash.filter(([a, b]) => 'TJQKA'.includes(a[0]) || 'TJQKA'.includes(b[0]))
    expect(hasBroadway).toEqual([])
  })

  it('classifies the boundary hands the way a poker player would', () => {
    const cases: Array<[[CardString, CardString], HandClass]> = [
      // Pairs, split by height.
      [['Ah', 'Ad'], 'pairHigh'],
      [['Th', 'Td'], 'pairHigh'], // TT is the floor of "high"
      [['9h', '9d'], 'pairMid'],
      [['6h', '6d'], 'pairMid'], // 66 is the floor of "mid"
      [['5h', '5d'], 'pairLow'],
      [['2h', '2d'], 'pairLow'],

      // Broadway beats connector *and* ace-x, so AKs is not a "suited connector" and KQs
      // is not either — both are broadway. This ordering is the whole reason the tests
      // exist: get it wrong and the biggest class silently steals from two others.
      [['Ah', 'Kh'], 'suitedBroadway'],
      [['Kh', 'Qh'], 'suitedBroadway'],
      [['Jh', 'Th'], 'suitedBroadway'], // JTs: both ten-or-better
      [['Ah', 'Kd'], 'offsuitBroadway'],
      [['Jh', 'Td'], 'offsuitBroadway'],

      // Ace-x beats connector: A2s is a suited ace, not a suited trash hand.
      [['Ah', '9h'], 'suitedAce'],
      [['Ah', '2h'], 'suitedAce'],
      [['Ah', '5d'], 'offsuitAce'],

      // Connector is tested *before* broadway-x, so T9s stays a suited connector — which is
      // what it is — rather than becoming a ten-with-a-nine.
      [['Th', '9h'], 'suitedConnector'],
      [['5h', '4h'], 'suitedConnector'],
      [['9h', '8d'], 'offsuitConnector'],

      // Broadway-x: exactly one broadway card, unconnected. The class that keeps K9s away
      // from 72s.
      [['Kh', '9h'], 'suitedBroadwayX'],
      [['Kh', '2h'], 'suitedBroadwayX'], // K2s: broadway needs *both* cards to be broadway
      [['Qh', '9h'], 'suitedBroadwayX'], // not a gapper — the queen is what matters
      [['Th', '2h'], 'suitedBroadwayX'],
      [['Kh', '9d'], 'offsuitBroadwayX'],

      // Gapper and trash now mean what they say: no broadway card at all.
      [['9h', '7h'], 'suitedGapper'],
      [['9h', '6h'], 'suitedGapper'],
      [['9h', '6d'], 'offsuitGapper'],
      [['9h', '5h'], 'suitedTrash'],
      [['7h', '2h'], 'suitedTrash'],
      [['9h', '4d'], 'offsuitTrash'],
      [['7h', '2d'], 'offsuitTrash'],
    ]

    for (const [cards, expected] of cases) {
      expect(classOfHand(cards), `${cards[0]}${cards[1]}`).toBe(expected)
    }
  })

  it('does not care which card comes first', () => {
    for (const [a, b] of combos) {
      expect(classOfHand([b, a])).toBe(classOfHand([a, b]))
    }
  })

  it('returns null for cards it cannot read', () => {
    expect(classOfHand(['Xh' as CardString, 'Ad'])).toBeNull()
  })
})
