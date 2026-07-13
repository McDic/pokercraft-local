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

      // T9s is the first connector below broadway (T is broadway, 9 is not).
      [['Th', '9h'], 'suitedConnector'],
      [['5h', '4h'], 'suitedConnector'],
      [['9h', '8d'], 'offsuitConnector'],

      // Gapper: 2-3 ranks apart.
      [['9h', '7h'], 'suitedGapper'],
      [['9h', '6h'], 'suitedGapper'],
      [['9h', '6d'], 'offsuitGapper'],

      // Trash: four or more apart, and no ace to redeem it.
      [['9h', '5h'], 'suitedTrash'],
      [['Kh', '2h'], 'suitedTrash'], // K2s: broadway needs *both* cards, not just one
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
