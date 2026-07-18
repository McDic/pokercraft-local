import { describe, it, expect } from 'vitest'
import { analyzeFinalTables, isSatelliteName } from './finalTable'
import { makeTournament, makeHandHistory } from '../test/fixtures'
import type { HandHistory } from '../types'

/** Build one hand: seats is a list of [playerId, chips] assigned to seats 1..n. */
function hand(
  opts: {
    tournamentId: number
    day: number // datetime ordering within a tournament
    tableId: string
    maxSeats: number
    stacks: Array<[string, number]>
  }
): HandHistory {
  const seats = new Map<number, [string, number]>()
  opts.stacks.forEach((s, i) => seats.set(i + 1, s))
  return makeHandHistory(`TM${opts.tournamentId}-${opts.day}`, {
    tournamentId: opts.tournamentId,
    datetime: new Date(2026, 5, opts.day),
    tableId: opts.tableId,
    maxSeats: opts.maxSeats,
    seats,
  })
}

describe('analyzeFinalTables', () => {
  it('detects a final-table reach and computes entry rank / chip ratio', () => {
    // Finished 8th of 1462 at a 9-max final table (Crazy-Eights-shaped).
    const summary = makeTournament(100, { myRank: 8, totalPlayers: 1462 })
    const nine: Array<[string, number]> = [
      ['Hero', 100], ['a', 200], ['b', 300], ['c', 400],
      ['d', 500], ['e', 600], ['f', 700], ['g', 800], ['h', 900],
    ]
    const hands = [
      hand({ tournamentId: 100, day: 1, tableId: 'A', maxSeats: 8, stacks: nine.slice(0, 8) }),
      // First hand at the 9-max final table = entry.
      hand({ tournamentId: 100, day: 2, tableId: 'B', maxSeats: 9, stacks: nine }),
      hand({ tournamentId: 100, day: 3, tableId: 'B', maxSeats: 9, stacks: nine.slice(0, 8) }),
    ]

    const { rows, skipped } = analyzeFinalTables([summary], hands)
    expect(skipped).toHaveLength(0)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.finish).toBe(8)
    expect(r.entrants).toBe(1462)
    expect(r.finalTableSize).toBe(9)
    expect(r.entrySeated).toBe(9)
    expect(r.entryRank).toBe(9) // Hero (100) is the shortest of 9 stacks
    expect(r.entryChipRatio).toBeCloseTo(100 / 4500, 6)
    expect(r.reentry).toBe(false)
  })

  it('folds a 2-max heads-up spin-off back into the final table for the entry hand', () => {
    // Won the tournament; last table is a dedicated 2-max heads-up table, but entry must come
    // from the 9-max final table proper, not the heads-up table.
    const summary = makeTournament(200, { myRank: 1, totalPlayers: 640 })
    const ftNine: Array<[string, number]> = [
      ['Hero', 500], ['a', 200], ['b', 300], ['c', 400],
      ['d', 600], ['e', 700], ['f', 800], ['g', 900], ['h', 1000],
    ]
    const hands = [
      hand({ tournamentId: 200, day: 1, tableId: 'B', maxSeats: 9, stacks: ftNine }),       // entry
      hand({ tournamentId: 200, day: 2, tableId: 'B', maxSeats: 9, stacks: ftNine.slice(0, 5) }),
      hand({ tournamentId: 200, day: 3, tableId: 'C', maxSeats: 2, stacks: [['Hero', 4000], ['h', 1400]] }),
      hand({ tournamentId: 200, day: 4, tableId: 'C', maxSeats: 2, stacks: [['Hero', 5400], ['h', 0]] }),
    ]

    const { rows, skipped } = analyzeFinalTables([summary], hands)
    expect(skipped).toHaveLength(0)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.finalTableSize).toBe(9) // the 9-max table, not the 2-max spin-off
    expect(r.entrySeated).toBe(9) // entry taken from the 9-max first hand
    expect(r.finish).toBe(1)
    // Hero (500) sits 6th of 9 at entry: a,b,c beneath; d,e,f,g,h (5 stacks) above.
    expect(r.entryRank).toBe(6)
    expect(r.entryChipRatio).toBeCloseTo(500 / 5400, 6)
  })

  it('rejects a bust before the final table into skipped, never into rows', () => {
    // Finished 50th; last table is a regular 8-max table -> 50 > 8, not a final-table reach.
    const summary = makeTournament(300, { myRank: 50, totalPlayers: 900 })
    const eight: Array<[string, number]> = [
      ['Hero', 100], ['a', 200], ['b', 300], ['c', 400],
      ['d', 500], ['e', 600], ['f', 700], ['g', 800],
    ]
    const hands = [
      hand({ tournamentId: 300, day: 1, tableId: 'A', maxSeats: 8, stacks: eight }),
      hand({ tournamentId: 300, day: 2, tableId: 'A', maxSeats: 8, stacks: eight }),
    ]

    const { rows, skipped } = analyzeFinalTables([summary], hands)
    expect(rows).toHaveLength(0)
    expect(skipped).toHaveLength(1)
    expect(skipped[0].tournamentId).toBe(300)
    expect(skipped[0].reason).toMatch(/before the final table/)
  })

  it('ignores hand histories with no matching summary (join is inner)', () => {
    const summary = makeTournament(100, { myRank: 8, totalPlayers: 100 })
    const hands = [
      // tournament 999 has hands but no summary -> must not appear anywhere
      hand({ tournamentId: 999, day: 1, tableId: 'A', maxSeats: 8, stacks: [['Hero', 100], ['a', 200]] }),
    ]
    const { rows, skipped } = analyzeFinalTables([summary], hands)
    expect(rows).toHaveLength(0)
    expect(skipped).toHaveLength(0)
  })

  it('excludes satellites by name, even with a large field and a deep finish', () => {
    const summary = makeTournament(500, {
      myRank: 1,
      totalPlayers: 500,
      name: 'AoF Hyper Sit & Go Satellite to WSOP Online',
    })
    const hands = [
      hand({ tournamentId: 500, day: 1, tableId: 'B', maxSeats: 8, stacks: [['Hero', 100], ['a', 90]] }),
    ]
    const { rows, skipped } = analyzeFinalTables([summary], hands)
    expect(rows).toHaveLength(0)
    expect(skipped[0].reason).toMatch(/satellite/)
  })

  it('excludes micro-field events (< 10 entrants)', () => {
    const summary = makeTournament(600, { myRank: 1, totalPlayers: 4, name: 'Some Hyper 4-max' })
    const hands = [
      hand({ tournamentId: 600, day: 1, tableId: 'B', maxSeats: 4, stacks: [['Hero', 100], ['a', 90], ['b', 80], ['c', 70]] }),
    ]
    const { rows, skipped } = analyzeFinalTables([summary], hands)
    expect(rows).toHaveLength(0)
    expect(skipped[0].reason).toMatch(/field of 4/)
  })

  it('classifies satellite names but leaves real MTTs alone', () => {
    expect(isSatelliteName('AoF Hyper Sit & Go Satellite to $25 Mystery')).toBe(true)
    expect(isSatelliteName('$1 Step to $1M GGMasters, $8 MEGA')).toBe(true)
    expect(isSatelliteName('$1.50 Flipout to Flip & Go Millionaire')).toBe(true)
    expect(isSatelliteName('$6 Mega to WSOP: $54 Bounty Hunters MAIN EVENT')).toBe(true)
    expect(isSatelliteName('¥25 Hyper [10 BB] to The Weekender Zodiac Big Bang')).toBe(true)
    // Real MTTs must not be caught:
    expect(isSatelliteName('51-NLH: $8.88 Crazy Eights Asia [8-Max]')).toBe(false)
    expect(isSatelliteName('Sunday Fifty Stack $5.50')).toBe(false)
    expect(isSatelliteName('Mini Hypersonic 2.50')).toBe(false)
    expect(isSatelliteName('Sunday Hyper 2')).toBe(false)
    expect(isSatelliteName('Zodiac Dog Ultra Deepstack 7-Max ¥110 [Turbo]')).toBe(false)
    // Flip & Go: Go Stage is a real tournament (keep); Flip Stage is the qualifier (exclude);
    // a standalone Flipout cash event is real (keep).
    expect(isSatelliteName('Flip & Go $0.05 [Go Stage]')).toBe(false)
    expect(isSatelliteName('Flip & Go $0.50 [Flip Stage H]')).toBe(true)
    expect(isSatelliteName('Daily $100,000 #ThanksGG Flipout')).toBe(false)
    expect(isSatelliteName('WSOP $5 Qualifier: Sunday Special')).toBe(true)
  })

  it('sorts hands chronologically even when supplied out of order', () => {
    const summary = makeTournament(700, { myRank: 8, totalPlayers: 1000 })
    const nine: Array<[string, number]> = [
      ['Hero', 100], ['a', 200], ['b', 300], ['c', 400],
      ['d', 500], ['e', 600], ['f', 700], ['g', 800], ['h', 900],
    ]
    const ordered = [
      hand({ tournamentId: 700, day: 1, tableId: 'A', maxSeats: 8, stacks: nine.slice(0, 8) }),
      hand({ tournamentId: 700, day: 2, tableId: 'B', maxSeats: 9, stacks: nine }), // entry
      hand({ tournamentId: 700, day: 3, tableId: 'B', maxSeats: 9, stacks: nine.slice(0, 8) }),
    ]
    const { rows } = analyzeFinalTables([summary], [ordered[2], ordered[0], ordered[1]])
    expect(rows).toHaveLength(1)
    expect(rows[0].finalTableSize).toBe(9)
    expect(rows[0].entrySeated).toBe(9)
    expect(rows[0].entryRank).toBe(9)
  })

  it('skips a tournament whose final-table capacity is unknown (maxSeats sentinel)', () => {
    const summary = makeTournament(800, { myRank: 3, totalPlayers: 500 })
    const hands = [
      hand({ tournamentId: 800, day: 1, tableId: '', maxSeats: 999, stacks: [['Hero', 100], ['a', 90]] }),
    ]
    const { rows, skipped } = analyzeFinalTables([summary], hands)
    expect(rows).toHaveLength(0)
    expect(skipped[0].reason).toMatch(/capacity unknown/)
  })

  it('ranks stacks tied with Hero at Hero\'s (best) position', () => {
    const summary = makeTournament(900, { myRank: 3, totalPlayers: 300 })
    const stacks: Array<[string, number]> = [
      ['Hero', 100], ['a', 100], ['b', 100], ['c', 200], ['d', 300], ['e', 400],
    ]
    const hands = [hand({ tournamentId: 900, day: 1, tableId: 'B', maxSeats: 6, stacks })]
    const { rows } = analyzeFinalTables([summary], hands)
    // Three stacks strictly greater than 100 → rank 4; the two players tied with Hero share it.
    expect(rows[0].entryRank).toBe(4)
  })

  it('ignores hands with a null tournamentId', () => {
    const summary = makeTournament(1000, { myRank: 1, totalPlayers: 100 })
    const real = hand({ tournamentId: 1000, day: 1, tableId: 'B', maxSeats: 9, stacks: [['Hero', 100], ['a', 90]] })
    const orphan = makeHandHistory('TMX', {
      tournamentId: null,
      datetime: new Date(2026, 5, 1),
      tableId: 'Z',
      maxSeats: 8,
      seats: new Map([[1, ['Hero', 50]]]),
    })
    const { rows } = analyzeFinalTables([summary], [real, orphan])
    expect(rows).toHaveLength(1)
    expect(rows[0].tournamentId).toBe(1000)
  })

  it('flags re-entry tournaments', () => {
    const summary = makeTournament(400, { myRank: 2, totalPlayers: 300, myEntries: 2 })
    const stacks: Array<[string, number]> = [
      ['Hero', 300], ['a', 200], ['b', 400], ['c', 500], ['d', 600], ['e', 700],
    ]
    const hands = [hand({ tournamentId: 400, day: 1, tableId: 'B', maxSeats: 6, stacks })]
    const { rows } = analyzeFinalTables([summary], hands)
    expect(rows).toHaveLength(1)
    expect(rows[0].reentry).toBe(true)
  })
})
