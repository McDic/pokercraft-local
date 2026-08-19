import { describe, it, expect } from 'vitest'
import { analyzeLateRegistration } from './lateRegistration'
import { makeTournament, makeHandHistory } from '../test/fixtures'
import type { HandHistory } from '../types'

/**
 * A hand where the Hero is dealt `heroChips` deep. With `bust`, the Hero loses the whole
 * stack (an all-in bet and no winnings), which is what splits re-entry lifecycles.
 */
function entryHand(
  id: string,
  tournamentId: number,
  datetime: Date,
  heroChips: number,
  overrides: Partial<HandHistory> & { bust?: boolean } = {}
): HandHistory {
  const { bust, ...rest } = overrides
  return makeHandHistory(id, {
    tournamentId,
    datetime,
    seats: new Map([
      [1, ['Hero', heroChips]],
      [2, ['villain', 10_000]],
    ]),
    actionsPreflop: bust
      ? [{ playerId: 'Hero', action: 'bet', amount: heroChips, isAllIn: true }]
      : [],
    ...rest,
  })
}

describe('analyzeLateRegistration', () => {
  it('computes depth, lateness, and return from the chronologically first hand', () => {
    const tournament = makeTournament(1, {
      buyInPure: 9,
      rake: 1,
      myPrize: 25,
      startTime: new Date(2026, 0, 1, 12, 0, 0),
    })
    // Supplied out of order: the later (deeper-blind) hand comes first in the array.
    const hands = [
      entryHand('TM2', 1, new Date(2026, 0, 1, 12, 40, 0), 4_000, { bb: 200, level: 9 }),
      entryHand('TM1', 1, new Date(2026, 0, 1, 12, 34, 0), 5_000, { bb: 100, level: 5 }),
    ]

    const result = analyzeLateRegistration([tournament], hands)

    expect(result.skippedMismatch).toBe(0)
    expect(result.joinedTournaments).toBe(1)
    expect(result.entries).toEqual([
      {
        tournamentId: 1,
        entryIndex: 0,
        totalEntries: 1,
        stackBB: 50, // 5000 / bb 100, from the 12:34 hand, not the 12:40 one
        minutesLate: 34,
        level: 5,
        rr: 1.5, // 25 / (9 + 1) − 1
        profitUsd: 15, // 25 − 10
        buyIn: 10,
      },
    ])
  })

  it('is an inner join and ignores hands without a tournament id', () => {
    const hands = [
      entryHand('TM1', 999, new Date(2026, 0, 1), 5_000), // no summary for #999
      entryHand('TM2', 1, new Date(2026, 0, 1), 5_000, { tournamentId: null }),
    ]
    const result = analyzeLateRegistration([makeTournament(1)], hands)
    expect(result.entries).toEqual([])
    expect(result.joinedTournaments).toBe(0)
    expect(result.skippedMismatch).toBe(0)
  })

  it('clamps lateness at zero when the first hand predates the official start', () => {
    const tournament = makeTournament(1, { startTime: new Date(2026, 0, 1, 13, 0, 0) })
    const hands = [entryHand('TM1', 1, new Date(2026, 0, 1, 12, 59, 0), 5_000)]
    const result = analyzeLateRegistration([tournament], hands)
    expect(result.entries[0].minutesLate).toBe(0)
  })

  it('splits re-entries into per-entry points, with the prize on the last', () => {
    const tournament = makeTournament(1, {
      buyInPure: 9,
      rake: 1,
      myPrize: 30,
      myEntries: 2,
      startTime: new Date(2026, 0, 1, 12, 0, 0),
    })
    const hands = [
      // First bullet: enters at 100bb and busts.
      entryHand('TM1', 1, new Date(2026, 0, 1, 12, 5, 0), 5_000, {
        bb: 50,
        level: 2,
        bust: true,
      }),
      // Re-entry: enters at 25bb.
      entryHand('TM2', 1, new Date(2026, 0, 1, 12, 50, 0), 5_000, { bb: 200, level: 10 }),
    ]

    const result = analyzeLateRegistration([tournament], hands)

    expect(result.skippedMismatch).toBe(0)
    expect(result.entries).toHaveLength(2)
    const [first, reentry] = result.entries
    expect(first).toMatchObject({
      entryIndex: 0,
      totalEntries: 2,
      stackBB: 100,
      minutesLate: 5,
      rr: -1,
      profitUsd: -10,
    })
    expect(reentry).toMatchObject({
      entryIndex: 1,
      totalEntries: 2,
      stackBB: 25,
      minutesLate: 50,
      rr: 2, // 30 / 10 − 1
      profitUsd: 20, // 30 − 10
    })
  })

  it('skips a tournament whose lifecycles do not match its entry count', () => {
    // The summary says two entries, but no bust hand was downloaded, so the hands
    // form a single lifecycle — every per-entry number would be wrong.
    const tournament = makeTournament(1, { myEntries: 2 })
    const hands = [entryHand('TM1', 1, new Date(2026, 0, 1), 5_000)]
    const result = analyzeLateRegistration([tournament], hands)
    expect(result.entries).toEqual([])
    expect(result.joinedTournaments).toBe(0)
    expect(result.skippedMismatch).toBe(1)
  })

  it('drops freerolls, where a relative return is undefined', () => {
    const tournament = makeTournament(1, { buyInPure: 0, rake: 0 })
    const hands = [entryHand('TM1', 1, new Date(2026, 0, 1), 5_000)]
    const result = analyzeLateRegistration([tournament], hands)
    expect(result.entries).toEqual([])
    expect(result.skippedMismatch).toBe(0)
  })
})
