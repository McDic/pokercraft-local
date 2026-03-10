import type { TournamentSummary } from '../types'
import { getTournamentBuyIn } from '../types'

export interface AggregateStats {
  tournamentCount: number
  entryCount: number
  totalBuyIn: number
  totalPrize: number
  totalRake: number
  netProfit: number
  roi: number | null
  itmCount: number
  itmRatio: number | null
  avgBuyIn: number | null
  bestCash: number
}

export interface SessionSummary extends AggregateStats {
  key: string
  tournaments: TournamentSummary[]
}

export interface SessionView extends SessionSummary {
  visibleTournaments: TournamentSummary[]
  visibleSummary: AggregateStats
  isFiltered: boolean
}

export function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export function getSessionKey(value: Date | string): string {
  const date = asDate(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function summarizeTournaments(tournaments: TournamentSummary[]): AggregateStats {
  let entryCount = 0
  let totalBuyIn = 0
  let totalPrize = 0
  let totalRake = 0
  let itmCount = 0
  let bestCash = 0

  for (const tournament of tournaments) {
    const buyIn = getTournamentBuyIn(tournament)
    const spent = buyIn * tournament.myEntries
    const rakePaid = tournament.rake * tournament.myEntries

    entryCount += tournament.myEntries
    totalBuyIn += spent
    totalPrize += tournament.myPrize
    totalRake += rakePaid

    if (tournament.myPrize > 0) {
      itmCount += 1
      bestCash = Math.max(bestCash, tournament.myPrize)
    }
  }

  const tournamentCount = tournaments.length
  const netProfit = totalPrize - totalBuyIn

  return {
    tournamentCount,
    entryCount,
    totalBuyIn,
    totalPrize,
    totalRake,
    netProfit,
    roi: totalBuyIn > 0 ? netProfit / totalBuyIn : null,
    itmCount,
    itmRatio: tournamentCount > 0 ? itmCount / tournamentCount : null,
    avgBuyIn: entryCount > 0 ? totalBuyIn / entryCount : null,
    bestCash,
  }
}

export function getSessionSummaries(tournaments: TournamentSummary[]): SessionSummary[] {
  const grouped = new Map<string, TournamentSummary[]>()

  for (const tournament of tournaments) {
    const key = getSessionKey(tournament.startTime)
    const sessionTournaments = grouped.get(key) ?? []
    sessionTournaments.push(tournament)
    grouped.set(key, sessionTournaments)
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, sessionTournaments]) => ({
      key,
      tournaments: [...sessionTournaments].sort(
        (a, b) => asDate(b.startTime).getTime() - asDate(a.startTime).getTime()
      ),
      ...summarizeTournaments(sessionTournaments),
    }))
}

export function getVisibleTournaments(
  tournaments: TournamentSummary[],
  searchQuery: string
): TournamentSummary[] {
  const normalizedQuery = searchQuery.trim().toLowerCase()

  return [...tournaments]
    .sort((a, b) => asDate(b.startTime).getTime() - asDate(a.startTime).getTime())
    .filter(tournament => {
      if (!normalizedQuery) {
        return true
      }

      return (
        tournament.name.toLowerCase().includes(normalizedQuery) ||
        String(tournament.id).includes(normalizedQuery)
      )
    })
}

export function getSessionViews(
  sessions: SessionSummary[],
  searchQuery: string
): SessionView[] {
  return sessions
    .map(session => {
      const visibleTournaments = getVisibleTournaments(session.tournaments, searchQuery)
      return {
        ...session,
        visibleTournaments,
        visibleSummary: summarizeTournaments(visibleTournaments),
        isFiltered: visibleTournaments.length !== session.tournamentCount,
      }
    })
    .filter(session => session.visibleTournaments.length > 0)
}
