import { describe, expect, it } from 'vitest'
import type { HandHistory, TournamentSummary } from '../types'
import { mergeHandHistories, mergeTournaments } from './useAnalysisWorker'

function createTournament(id: number, name: string): TournamentSummary {
  return {
    id,
    name,
    buyInPure: 10,
    rake: 1,
    totalPrizePool: 100,
    startTime: new Date('2026-01-01T12:00:00Z'),
    myRank: 1,
    totalPlayers: 100,
    myPrize: 50,
    myEntries: 1,
  }
}

function createHandHistory(id: string, tournamentId: number): HandHistory {
  return {
    id,
    tournamentId,
    tournamentName: 'Test Tournament',
    level: 1,
    sb: 10,
    bb: 20,
    datetime: new Date('2026-01-01T12:00:00Z'),
    buttonSeat: 1,
    sbSeat: 2,
    bbSeat: 3,
    maxSeats: 9,
    seats: new Map(),
    knownCards: new Map(),
    wons: new Map(),
    communityCards: [],
    actionsPreflop: [],
    actionsFlop: [],
    actionsTurn: [],
    actionsRiver: [],
    uncalledReturned: null,
    allIned: new Map(),
  }
}

describe('mergeTournaments', () => {
  it('deduplicates against existing items and within the new batch', () => {
    const existing = [
      createTournament(1, 'Existing tournament'),
    ]

    const newItems = [
      createTournament(1, 'Duplicate existing tournament'),
      createTournament(2, 'Batch first tournament'),
      createTournament(2, 'Batch duplicate tournament'),
      createTournament(3, 'Unique tournament'),
    ]

    expect(mergeTournaments(existing, newItems)).toEqual([
      createTournament(1, 'Existing tournament'),
      createTournament(2, 'Batch first tournament'),
      createTournament(3, 'Unique tournament'),
    ])
  })

  it('also removes duplicates that already slipped into the existing state', () => {
    const existing = [
      createTournament(1, 'First copy'),
      createTournament(1, 'Second copy'),
      createTournament(2, 'Unique copy'),
    ]

    expect(mergeTournaments(existing, [])).toEqual([
      createTournament(1, 'First copy'),
      createTournament(2, 'Unique copy'),
    ])
  })
})

describe('mergeHandHistories', () => {
  it('deduplicates against existing items and within the new batch', () => {
    const existing = [
      createHandHistory('HH-1', 1001),
    ]

    const newItems = [
      createHandHistory('HH-1', 1001),
      createHandHistory('HH-2', 1002),
      createHandHistory('HH-2', 1002),
      createHandHistory('HH-3', 1003),
    ]

    expect(mergeHandHistories(existing, newItems)).toEqual([
      createHandHistory('HH-1', 1001),
      createHandHistory('HH-2', 1002),
      createHandHistory('HH-3', 1003),
    ])
  })
})
