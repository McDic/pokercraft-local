import { describe, it, expect } from 'vitest'
import { mergeTournaments, mergeHandHistories } from './useAnalysisWorker'
import { makeTournament, makeHandHistory } from '../test/fixtures'

const at = (day: number) => new Date(2026, 0, day)

describe('mergeTournaments', () => {
  it('appends new tournaments and keeps them sorted by start time', () => {
    const existing = [makeTournament(1, { startTime: at(1) })]
    const merged = mergeTournaments(existing, [
      makeTournament(3, { startTime: at(3) }),
      makeTournament(2, { startTime: at(2) }),
    ])

    expect(merged.map(t => t.id)).toEqual([1, 2, 3])
  })

  it('drops tournaments whose ID is already present', () => {
    const existing = [makeTournament(1)]
    const merged = mergeTournaments(existing, [makeTournament(1), makeTournament(2)])

    expect(merged.map(t => t.id)).toEqual([1, 2])
  })

  // TournamentCharts treats a changed array identity as "the data changed", so a
  // merge that adds nothing must not hand back a fresh array.
  it('returns the existing array itself when nothing new is added', () => {
    const existing = [makeTournament(1)]

    expect(mergeTournaments(existing, [])).toBe(existing)
    expect(mergeTournaments(existing, [makeTournament(1)])).toBe(existing)
  })

  it('returns a new array, leaving the existing one untouched, when something is added', () => {
    const existing = [makeTournament(1)]
    const merged = mergeTournaments(existing, [makeTournament(2)])

    expect(merged).not.toBe(existing)
    expect(existing).toHaveLength(1)
  })
})

describe('mergeHandHistories', () => {
  it('appends new hands and keeps them sorted by time', () => {
    const existing = [makeHandHistory('TM1', { datetime: at(1) })]
    const merged = mergeHandHistories(existing, [
      makeHandHistory('TM3', { datetime: at(3) }),
      makeHandHistory('TM2', { datetime: at(2) }),
    ])

    expect(merged.map(h => h.id)).toEqual(['TM1', 'TM2', 'TM3'])
  })

  it('returns the existing array itself when nothing new is added', () => {
    const existing = [makeHandHistory('TM1')]

    expect(mergeHandHistories(existing, [])).toBe(existing)
    expect(mergeHandHistories(existing, [makeHandHistory('TM1')])).toBe(existing)
  })
})
