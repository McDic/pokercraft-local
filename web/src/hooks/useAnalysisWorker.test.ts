import { describe, it, expect } from 'vitest'
import { mergeTournaments, mergeHandHistories } from './useAnalysisWorker'
import type { TournamentSummary, HandHistory } from '../types'

function tournament(id: number, startTime: string): TournamentSummary {
  return {
    id,
    name: `T${id}`,
    buyInPure: 0.9,
    rake: 0.1,
    totalPrizePool: 100,
    startTime: new Date(startTime),
    myRank: 1,
    totalPlayers: 100,
    myPrize: 5,
    myEntries: 1,
  }
}

function handHistory(id: string, datetime: string): HandHistory {
  return {
    id,
    tournamentId: 1,
    tournamentName: 'T1',
    level: 1,
    sb: 10,
    bb: 20,
    datetime: new Date(datetime),
    buttonSeat: 1,
    sbSeat: 2,
    bbSeat: 3,
    maxSeats: 9,
    seats: new Map(),
    knownCards: new Map(),
    wons: new Map(),
  } as HandHistory
}

describe('mergeTournaments', () => {
  it('appends new tournaments and keeps them sorted by start time', () => {
    const existing = [tournament(1, '2026-01-01')]
    const merged = mergeTournaments(existing, [tournament(3, '2026-01-03'), tournament(2, '2026-01-02')])

    expect(merged.map(t => t.id)).toEqual([1, 2, 3])
  })

  it('drops tournaments whose ID is already present', () => {
    const existing = [tournament(1, '2026-01-01')]
    const merged = mergeTournaments(existing, [tournament(1, '2026-01-01'), tournament(2, '2026-01-02')])

    expect(merged.map(t => t.id)).toEqual([1, 2])
  })

  // Downstream chart code treats a changed array identity as "the data changed",
  // so a merge that adds nothing must not hand back a fresh array.
  it('returns the existing array itself when nothing new is added', () => {
    const existing = [tournament(1, '2026-01-01')]

    expect(mergeTournaments(existing, [])).toBe(existing)
    expect(mergeTournaments(existing, [tournament(1, '2026-01-01')])).toBe(existing)
  })

  it('returns a new array when something is added', () => {
    const existing = [tournament(1, '2026-01-01')]
    const merged = mergeTournaments(existing, [tournament(2, '2026-01-02')])

    expect(merged).not.toBe(existing)
    expect(existing).toHaveLength(1)
  })
})

describe('mergeHandHistories', () => {
  it('appends new hands and keeps them sorted by time', () => {
    const existing = [handHistory('TM1', '2026-01-01')]
    const merged = mergeHandHistories(existing, [
      handHistory('TM3', '2026-01-03'),
      handHistory('TM2', '2026-01-02'),
    ])

    expect(merged.map(h => h.id)).toEqual(['TM1', 'TM2', 'TM3'])
  })

  it('returns the existing array itself when nothing new is added', () => {
    const existing = [handHistory('TM1', '2026-01-01')]

    expect(mergeHandHistories(existing, [])).toBe(existing)
    expect(mergeHandHistories(existing, [handHistory('TM1', '2026-01-01')])).toBe(existing)
  })
})
