import { useCallback, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { TournamentSummary } from '../types'
import { getTournamentBuyIn, getTournamentProfit } from '../types'
import {
  asDate,
  getSessionKey,
  getSessionSummaries,
  getSessionViews,
  summarizeTournaments,
} from './tournamentSummaryDashboardUtils'

interface TournamentSummaryDashboardProps {
  tournaments: TournamentSummary[]
  handHistoryCount: number
  onFilesSelected?: (files: FileList | File[]) => void
  isLoading?: boolean
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

function areSameKeys(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function getExpandedSessionKeys(selectedKeys: string[], visibleKeys: string[]): string[] {
  const keptKeys = selectedKeys.filter(key => visibleKeys.includes(key))
  if (keptKeys.length > 0) {
    return keptKeys
  }

  return visibleKeys.slice(0, Math.min(2, visibleKeys.length))
}

export function TournamentSummaryDashboard({
  tournaments,
  handHistoryCount,
  onFilesSelected,
  isLoading = false,
}: TournamentSummaryDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedExpandedSessionKeys, setSelectedExpandedSessionKeys] = useState<string[]>([])
  const hasTournaments = tournaments.length > 0
  const overallSummary = hasTournaments
    ? summarizeTournaments(tournaments)
    : summarizeTournaments([])
  const sessions = hasTournaments ? getSessionSummaries(tournaments) : []
  const sessionViews = hasTournaments ? getSessionViews(sessions, searchQuery) : []
  const visibleSessionKeys = sessionViews.map(session => session.key)
  const expandedSessionKeys = getExpandedSessionKeys(selectedExpandedSessionKeys, visibleSessionKeys)

  const toggleSession = (sessionKey: string) => {
    setSelectedExpandedSessionKeys(previous => {
      const currentKeys = getExpandedSessionKeys(previous, visibleSessionKeys)
      const nextKeys = currentKeys.includes(sessionKey)
        ? currentKeys.filter(key => key !== sessionKey)
        : [...currentKeys, sessionKey]

      return areSameKeys(previous, nextKeys) ? previous : nextKeys
    })
  }

  const expandAllSessions = () => {
    setSelectedExpandedSessionKeys(sessionViews.map(session => session.key))
  }

  const collapseAllSessions = () => {
    setSelectedExpandedSessionKeys([])
  }

  const handleAdditionalFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!onFilesSelected || isLoading) {
        return
      }

      if (event.target.files && event.target.files.length > 0) {
        onFilesSelected(event.target.files)
        event.target.value = ''
      }
    },
    [isLoading, onFilesSelected]
  )

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
        <span className="ledger-strip-label">Daily Sessions</span>
        <div className="ledger-strip-stats">
          <span className="ledger-strip-stat">{overallSummary.tournamentCount} tournaments indexed</span>
          <span className="ledger-strip-stat">{sessions.length} session days</span>
          <span className="ledger-strip-stat">{overallSummary.entryCount} total entries</span>
        </div>
      </section>

      <section className="summary-band sticky-band">
        <div className="band-header">
          <div>
            <p className="section-eyebrow">Overall Results</p>
            <h3>Overall totals across all loaded sessions</h3>
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
            <span className="label">Cash Rate</span>
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
          <p className="section-eyebrow">Search &amp; Filters</p>
          <h3>Find sessions and tournaments</h3>
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
          {onFilesSelected && (
            <label className={`ghost-button file-import-ghost ${isLoading ? 'is-disabled' : ''}`}>
              <span>Add files</span>
              <input
                className="file-input-overlay"
                type="file"
                multiple
                accept=".txt,.zip"
                onChange={handleAdditionalFileInput}
                disabled={isLoading}
              />
            </label>
          )}
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
          const sessionSummary = session.isFiltered ? session.visibleSummary : session

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
                    <strong>{getSessionLabel(session.key)}</strong>
                    <span>
                      {sessionSummary.tournamentCount} tournaments, {sessionSummary.entryCount} entries, {sessionSummary.itmCount} cashes
                    </span>
                    {session.isFiltered && (
                      <span className="session-filter-note">
                        {session.visibleTournaments.length} matching current search
                      </span>
                    )}
                  </div>

                  <div className="session-metric-block">
                    <span className="label">Buy-ins</span>
                    <strong>{formatCurrency(sessionSummary.totalBuyIn)}</strong>
                  </div>
                  <div className="session-metric-block">
                    <span className="label">Rake</span>
                    <strong>{formatCurrency(sessionSummary.totalRake)}</strong>
                  </div>
                  <div className="session-metric-block hide-medium">
                    <span className="label">Prize</span>
                    <strong>{formatCurrency(sessionSummary.totalPrize)}</strong>
                  </div>
                  <div className="session-metric-block">
                    <span className="label">Net</span>
                    <strong className={formatProfitClass(sessionSummary.netProfit)}>
                      {formatCurrency(sessionSummary.netProfit)}
                    </strong>
                  </div>
                  <div className="session-metric-block hide-mobile">
                    <span className="label">ROI</span>
                    <strong className={formatProfitClass(sessionSummary.roi ?? 0)}>
                      {formatPercent(sessionSummary.roi)}
                    </strong>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="session-body">
                  <div className="session-note-bar">
                    <span className="pill">Entries {sessionSummary.entryCount}</span>
                    <span className="pill">Cashes {sessionSummary.itmCount}</span>
                    <span className="pill">Best cash {formatCurrency(sessionSummary.bestCash)}</span>
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
