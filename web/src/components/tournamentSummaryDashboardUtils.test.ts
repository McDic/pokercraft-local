import { describe, expect, it } from 'vitest'
import type { TournamentSummary } from '../types'
import {
  getExpandedSessionKeys,
  getSessionSummaries,
  getSessionViews,
  summarizeTournaments,
  toggleExpandedSessionKey,
} from './tournamentSummaryDashboardUtils'

function createTournament(overrides: Partial<TournamentSummary>): TournamentSummary {
  return {
    id: 1,
    name: 'Daily Hyper $20',
    buyInPure: 18.4,
    rake: 1.6,
    totalPrizePool: 1000,
    startTime: new Date('2026-02-14T20:00:00'),
    myRank: 39,
    totalPlayers: 416,
    myPrize: 43.79,
    myEntries: 1,
    ...overrides,
  }
}

describe('summarizeTournaments', () => {
  it('calculates totals across entries and rake correctly', () => {
    const summary = summarizeTournaments([
      createTournament({
        id: 11,
        buyInPure: 10,
        rake: 1,
        myPrize: 0,
        myEntries: 3,
      }),
      createTournament({
        id: 12,
        buyInPure: 20,
        rake: 2,
        myPrize: 50,
        myEntries: 1,
      }),
    ])

    expect(summary.tournamentCount).toBe(2)
    expect(summary.entryCount).toBe(4)
    expect(summary.totalBuyIn).toBe(55)
    expect(summary.totalRake).toBe(5)
    expect(summary.totalPrize).toBe(50)
    expect(summary.netProfit).toBe(-5)
    expect(summary.roi).toBeCloseTo(-5 / 55, 6)
    expect(summary.itmCount).toBe(1)
    expect(summary.itmRatio).toBe(0.5)
    expect(summary.avgBuyIn).toBeCloseTo(13.75, 6)
    expect(summary.bestCash).toBe(50)
  })
})

describe('getSessionViews', () => {
  it('uses filtered tournaments for session summary values when search is active', () => {
    const sessions = getSessionSummaries([
      createTournament({
        id: 21,
        name: 'Daily Hyper $20',
        startTime: new Date('2026-02-14T23:45:00'),
        myPrize: 43.79,
        myEntries: 1,
      }),
      createTournament({
        id: 22,
        name: 'Bounty Hunters $54',
        buyInPure: 49.68,
        rake: 4.32,
        startTime: new Date('2026-02-14T23:40:00'),
        myPrize: 0,
        myEntries: 2,
      }),
      createTournament({
        id: 23,
        name: 'Daily Turbo $8',
        buyInPure: 7.36,
        rake: 0.64,
        startTime: new Date('2026-02-13T18:00:00'),
        myPrize: 0,
      }),
    ])

    const views = getSessionViews(sessions, 'daily hyper')

    expect(views).toHaveLength(1)
    expect(views[0].visibleTournaments).toHaveLength(1)
    expect(views[0].isFiltered).toBe(true)
    expect(views[0].visibleSummary.tournamentCount).toBe(1)
    expect(views[0].visibleSummary.entryCount).toBe(1)
    expect(views[0].visibleSummary.totalBuyIn).toBeCloseTo(20, 6)
    expect(views[0].visibleSummary.totalRake).toBeCloseTo(1.6, 6)
    expect(views[0].visibleSummary.totalPrize).toBeCloseTo(43.79, 6)
    expect(views[0].visibleSummary.netProfit).toBeCloseTo(23.79, 6)
    expect(views[0].visibleSummary.itmCount).toBe(1)
  })
})

describe('expanded session helpers', () => {
  it('auto-opens the first two visible sessions only before the user changes anything', () => {
    expect(getExpandedSessionKeys(null, ['2026-02-15', '2026-02-14', '2026-02-13'])).toEqual([
      '2026-02-15',
      '2026-02-14',
    ])
  })

  it('keeps all sessions collapsed when collapse all explicitly sets an empty list', () => {
    expect(getExpandedSessionKeys([], ['2026-02-15', '2026-02-14', '2026-02-13'])).toEqual([])
  })

  it('collapses an auto-opened session immediately on first click', () => {
    expect(
      toggleExpandedSessionKey(
        null,
        ['2026-02-15', '2026-02-14', '2026-02-13'],
        '2026-02-14'
      )
    ).toEqual(['2026-02-15'])
  })

  it('respects collapse all and does not reopen the first two sessions', () => {
    expect(
      toggleExpandedSessionKey([], ['2026-02-15', '2026-02-14', '2026-02-13'], '2026-02-14')
    ).toEqual(['2026-02-14'])
  })
})
