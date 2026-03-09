import { useEffect, useState } from 'react'
import type { TournamentSummary } from '../types'
import { getTournamentBuyIn, getTournamentProfit } from '../types'

interface TournamentSummaryDashboardProps {
  tournaments: TournamentSummary[]
  handHistoryCount: number
}

interface AggregateStats {
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

interface SessionSummary extends AggregateStats {
  key: string
  label: string
  tournaments: TournamentSummary[]
}

interface SessionView extends SessionSummary {
  visibleTournaments: TournamentSummary[]
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const sessionDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
})

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function getSessionKey(value: Date | string): string {
  const date = asDate(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getSessionLabel(sessionKey: string): string {
  const [year, month, day] = sessionKey.split('-').map(Number)
  return sessionDateFormatter.format(new Date(year, month - 1, day))
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--'
  }

  return percentFormatter.format(value)
}

function formatProfitClass(value: number): string {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

function summarizeTournaments(tournaments: TournamentSummary[]): AggregateStats {
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

function getSessionSummaries(tournaments: TournamentSummary[]): SessionSummary[] {
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
      label: getSessionLabel(key),
      tournaments: [...sessionTournaments].sort(
        (a, b) => asDate(b.startTime).getTime() - asDate(a.startTime).getTime()
      ),
      ...summarizeTournaments(sessionTournaments),
    }))
}

function getVisibleTournaments(
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

function getSessionViews(sessions: SessionSummary[], searchQuery: string): SessionView[] {
  return sessions
    .map(session => ({
      ...session,
      visibleTournaments: getVisibleTournaments(session.tournaments, searchQuery),
    }))
    .filter(session => session.visibleTournaments.length > 0)
}

function areSameKeys(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

export function TournamentSummaryDashboard({
  tournaments,
  handHistoryCount,
}: TournamentSummaryDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSessionKeys, setExpandedSessionKeys] = useState<string[]>([])
  const hasTournaments = tournaments.length > 0
  const overallSummary = hasTournaments
    ? summarizeTournaments(tournaments)
    : summarizeTournaments([])
  const sessions = hasTournaments ? getSessionSummaries(tournaments) : []
  const sessionViews = hasTournaments ? getSessionViews(sessions, searchQuery) : []
  const visibleSessionKeys = sessionViews.map(session => session.key)
  const visibleSessionSignature = visibleSessionKeys.join('|')

  useEffect(() => {
    setExpandedSessionKeys(previous => {
      const keptKeys = previous.filter(key => visibleSessionKeys.includes(key))
      if (keptKeys.length > 0) {
        return areSameKeys(previous, keptKeys) ? previous : keptKeys
      }

      const fallbackKeys = visibleSessionKeys.slice(0, Math.min(2, visibleSessionKeys.length))
      return areSameKeys(previous, fallbackKeys) ? previous : fallbackKeys
    })
  }, [searchQuery, tournaments, visibleSessionSignature])

  const toggleSession = (sessionKey: string) => {
    setExpandedSessionKeys(previous => (
      previous.includes(sessionKey)
        ? previous.filter(key => key !== sessionKey)
        : [...previous, sessionKey]
    ))
  }

  const expandAllSessions = () => {
    setExpandedSessionKeys(sessionViews.map(session => session.key))
  }

  const collapseAllSessions = () => {
    setExpandedSessionKeys([])
  }

  if (!hasTournaments) {
    return (
      <div className="no-data">
        <p>No tournament summaries loaded yet.</p>
        {handHistoryCount > 0 && (
          <p className="no-data-hint">
            Hand histories were loaded, but this view focuses on tournament summary files.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="summary-dashboard">
      <section className="ledger-strip">
        <span className="ledger-strip-label">Tournament Ledger</span>
        <div className="ledger-strip-stats">
          <span className="ledger-strip-stat">{overallSummary.tournamentCount} tournaments indexed</span>
          <span className="ledger-strip-stat">{sessions.length} session days</span>
          <span className="ledger-strip-stat">{overallSummary.entryCount} total entries</span>
        </div>
      </section>

      <section className="summary-band sticky-band">
        <div className="band-header">
          <div>
            <p className="section-eyebrow">Session Rollup</p>
            <h3>Overall totals across all loaded summaries</h3>
          </div>
        </div>

        <div className="deck-grid">
          <article className="deck-cell">
            <span className="label">Buy-ins</span>
            <strong className="deck-value">{formatCurrency(overallSummary.totalBuyIn)}</strong>
          </article>
          <article className="deck-cell">
            <span className="label">Rake</span>
            <strong className="deck-value">{formatCurrency(overallSummary.totalRake)}</strong>
          </article>
          <article className="deck-cell">
            <span className="label">Prize</span>
            <strong className="deck-value">{formatCurrency(overallSummary.totalPrize)}</strong>
          </article>
          <article className="deck-cell">
            <span className="label">Net</span>
            <strong className={`deck-value ${formatProfitClass(overallSummary.netProfit)}`}>
              {formatCurrency(overallSummary.netProfit)}
            </strong>
          </article>
          <article className="deck-cell">
            <span className="label">ROI</span>
            <strong className={`deck-value ${formatProfitClass(overallSummary.roi ?? 0)}`}>
              {formatPercent(overallSummary.roi)}
            </strong>
          </article>
          <article className="deck-cell">
            <span className="label">ABI</span>
            <strong className="deck-value">{formatCurrency(overallSummary.avgBuyIn ?? 0)}</strong>
          </article>
          <article className="deck-cell">
            <span className="label">ITM</span>
            <strong className="deck-value">{formatPercent(overallSummary.itmRatio)}</strong>
          </article>
          <article className="deck-cell">
            <span className="label">Best cash</span>
            <strong className="deck-value">{formatCurrency(overallSummary.bestCash)}</strong>
          </article>
        </div>
      </section>

      <section className="summary-panel controls-panel">
        <div>
          <p className="section-eyebrow">Ledger Controls</p>
          <h3>Search and session visibility</h3>
          <p className="panel-copy">
            Showing {sessionViews.reduce((count, session) => count + session.visibleTournaments.length, 0)} tournaments
            across {sessionViews.length} session days.
          </p>
        </div>

        <label className="search-shell">
          <span>Search tournament or ID</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Daily Main, Bounty, 123456"
          />
        </label>

        <div className="control-actions">
          <button type="button" className="ghost-button" onClick={expandAllSessions}>
            Expand all
          </button>
          <button type="button" className="ghost-button" onClick={collapseAllSessions}>
            Collapse all
          </button>
        </div>
      </section>

      <section className="session-groups">
        {sessionViews.map(session => {
          const isExpanded = expandedSessionKeys.includes(session.key)

          return (
            <article
              key={session.key}
              className={`session-group ${isExpanded ? 'is-open' : ''}`}
            >
              <button
                type="button"
                className="session-toggle"
                onClick={() => toggleSession(session.key)}
              >
                <div className="session-head">
                  <div className="session-title">
                    <strong>{session.label}</strong>
                    <span>
                      {session.tournamentCount} tournaments, {session.entryCount} entries, {session.itmCount} cashes
                    </span>
                    {session.visibleTournaments.length !== session.tournamentCount && (
                      <span className="session-filter-note">
                        {session.visibleTournaments.length} matching current search
                      </span>
                    )}
                  </div>

                  <div className="session-metric-block">
                    <span className="label">Buy-ins</span>
                    <strong>{formatCurrency(session.totalBuyIn)}</strong>
                  </div>
                  <div className="session-metric-block">
                    <span className="label">Rake</span>
                    <strong>{formatCurrency(session.totalRake)}</strong>
                  </div>
                  <div className="session-metric-block hide-medium">
                    <span className="label">Prize</span>
                    <strong>{formatCurrency(session.totalPrize)}</strong>
                  </div>
                  <div className="session-metric-block">
                    <span className="label">Net</span>
                    <strong className={formatProfitClass(session.netProfit)}>
                      {formatCurrency(session.netProfit)}
                    </strong>
                  </div>
                  <div className="session-metric-block hide-mobile">
                    <span className="label">ROI</span>
                    <strong className={formatProfitClass(session.roi ?? 0)}>
                      {formatPercent(session.roi)}
                    </strong>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="session-body">
                  <div className="session-note-bar">
                    <span className="pill">Entries {session.entryCount}</span>
                    <span className="pill">Cashes {session.itmCount}</span>
                    <span className="pill">Best cash {formatCurrency(session.bestCash)}</span>
                  </div>

                  <div className="table-wrapper ledger-table-wrapper">
                    <table className="tournament-table">
                      <thead>
                        <tr>
                          <th>Start</th>
                          <th>Tournament</th>
                          <th>Entries</th>
                          <th>Buy-in</th>
                          <th>Prize</th>
                          <th>Net</th>
                          <th>Rake</th>
                          <th>ROI</th>
                          <th>Finish</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.visibleTournaments.map(tournament => {
                          const startTime = asDate(tournament.startTime)
                          const buyIn = getTournamentBuyIn(tournament)
                          const totalSpent = buyIn * tournament.myEntries
                          const totalRake = tournament.rake * tournament.myEntries
                          const profit = getTournamentProfit(tournament)
                          const roi = totalSpent > 0 ? profit / totalSpent : null
                          const finishShare = tournament.totalPlayers > 0
                            ? tournament.myRank / tournament.totalPlayers
                            : null

                          return (
                            <tr key={`${tournament.id}-${startTime.getTime()}`}>
                              <td>
                                <div className="cell-stack">
                                  <strong>{timeFormatter.format(startTime)}</strong>
                                  <span>{getSessionKey(startTime)}</span>
                                </div>
                              </td>
                              <td>
                                <div className="cell-stack">
                                  <strong>{tournament.name}</strong>
                                  <span>#{tournament.id}</span>
                                </div>
                              </td>
                              <td>{tournament.myEntries}x</td>
                              <td>
                                <div className="cell-stack">
                                  <strong>{formatCurrency(totalSpent)}</strong>
                                  <span>{formatCurrency(buyIn)} per entry</span>
                                </div>
                              </td>
                              <td>{formatCurrency(tournament.myPrize)}</td>
                              <td className={formatProfitClass(profit)}>{formatCurrency(profit)}</td>
                              <td>{formatCurrency(totalRake)}</td>
                              <td className={formatProfitClass(roi ?? 0)}>{formatPercent(roi)}</td>
                              <td>
                                <div className="cell-stack">
                                  <strong>{tournament.myRank} / {tournament.totalPlayers}</strong>
                                  <span>Top {formatPercent(finishShare)}</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </section>

      {sessionViews.length === 0 && (
        <div className="empty-table">
          No tournaments match the current search.
        </div>
      )}

      <p className="summary-footnote">
        Imported amounts are currently normalized to USD whenever Pokercraft files use a supported non-USD currency.
      </p>
    </div>
  )
}
