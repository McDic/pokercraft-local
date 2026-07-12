/**
 * Shared fixtures for tests.
 */

import type { TournamentSummary, HandHistory } from '../types'
import type { BankrollWorkerResult } from '../workers/analysisWorker'

export function makeTournament(
  id: number,
  overrides: Partial<TournamentSummary> = {}
): TournamentSummary {
  return {
    id,
    name: `T${id}`,
    buyInPure: 0.9,
    rake: 0.1,
    totalPrizePool: 100,
    startTime: new Date(2026, 0, id),
    myRank: 1,
    totalPlayers: 100,
    myPrize: 5,
    myEntries: 1,
    ...overrides,
  }
}

export function makeHandHistory(
  id: string,
  overrides: Partial<HandHistory> = {}
): HandHistory {
  return {
    id,
    tournamentId: 1,
    tournamentName: 'T1',
    level: 1,
    sb: 10,
    bb: 20,
    datetime: new Date(2026, 0, 1),
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
    ...overrides,
  }
}

/**
 * A bankroll run always returns one result per initial capital, so the length is
 * fixed and only the rates vary between runs.
 */
export function makeBankrollResults(bankruptcyRate: number): BankrollWorkerResult[] {
  return [10, 20, 50, 100, 200, 500].map(initialCapital => ({
    initialCapital,
    bankruptcyRate,
    survivalRate: 1 - bankruptcyRate,
  }))
}
