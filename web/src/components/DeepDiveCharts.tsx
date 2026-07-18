/**
 * "Deep Dive" — analyses that require BOTH tournament summaries and hand histories.
 *
 * This is the only tab that joins the two datasets. Its first (and, for now, only) section is
 * Final Table Runs: every final table the Hero reached, matched by the exact `Tournament #<id>`
 * key to its official result, so entry state (rank + chip share, from the hand history) sits next
 * to the finish and field size (from the summary). See `analysis/finalTable.ts`.
 *
 * A future joined analysis becomes a new `analysis/*.ts` module plus a new <section> here — never
 * a new tab. The analysis is a synchronous, memoized pass, so it re-runs exactly when either
 * dataset's array identity changes (i.e. when a later upload adds data).
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TournamentSummary, HandHistory } from '../types'
import type { TranslationKey } from '../i18n'
import { analyzeFinalTables, type FinalTableRow } from '../analysis/finalTable'

interface DeepDiveChartsProps {
  tournaments: TournamentSummary[]
  handHistories: HandHistory[]
}

type SortKey = 'date' | 'tournament' | 'entrants' | 'entryRank' | 'entryChipRatio' | 'finish'
interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function compare(a: FinalTableRow, b: FinalTableRow, key: SortKey): number {
  switch (key) {
    case 'date':
      return a.startTime.getTime() - b.startTime.getTime()
    case 'tournament':
      return a.name.localeCompare(b.name)
    case 'entrants':
      return a.entrants - b.entrants
    case 'entryRank':
      return a.entryRank - b.entryRank
    case 'entryChipRatio':
      return a.entryChipRatio - b.entryChipRatio
    case 'finish':
      return a.finish - b.finish
  }
}

export function DeepDiveCharts({ tournaments, handHistories }: DeepDiveChartsProps) {
  const { t } = useTranslation()
  // Default: most recent first, matching how the analysis returns them.
  const [sort, setSort] = useState<SortState>({ key: 'date', dir: 'desc' })

  const result = useMemo(
    () => analyzeFinalTables(tournaments, handHistories),
    [tournaments, handHistories]
  )

  const rows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...result.rows].sort((a, b) => compare(a, b, sort.key) * dir)
  }, [result.rows, sort])

  // First click sorts a column by its most useful direction (names A→Z, numbers high→low);
  // clicking the active column flips it.
  const onSort = (key: SortKey) =>
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'tournament' ? 'asc' : 'desc' }
    )

  const header = (key: SortKey, labelKey: TranslationKey, numeric = false) => {
    const active = sort.key === key
    return (
      <th className={numeric ? 'num' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="sort-header" onClick={() => onSort(key)}>
          {t(labelKey)}
          <span className="sort-arrow">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
        </button>
      </th>
    )
  }

  if (result.rows.length === 0) {
    return <div className="no-data">{t('charts.noDeepDiveData')}</div>
  }

  return (
    <div className="charts-container">
      <section className="chart-section">
        <h3>{t('deepDive.finalTable.title')}</h3>
        <p className="chart-caption">
          {t('deepDive.finalTable.subtitle', { n: result.rows.length })}
        </p>
        <p className="chart-caption">{t('deepDive.finalTable.note')}</p>
        <div className="deep-dive-table-wrap">
          <table className="deep-dive-table">
            <thead>
              <tr>
                {header('date', 'deepDive.finalTable.col.date')}
                {header('tournament', 'deepDive.finalTable.col.tournament')}
                {header('entrants', 'deepDive.finalTable.col.entrants', true)}
                {header('entryRank', 'deepDive.finalTable.col.entryRank', true)}
                {header('entryChipRatio', 'deepDive.finalTable.col.entryChipRatio', true)}
                {header('finish', 'deepDive.finalTable.col.finish', true)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.tournamentId}>
                  <td>{formatDate(r.startTime)}</td>
                  <td>
                    {r.name}
                    {r.reentry && (
                      <span className="reentry-tag"> {t('deepDive.finalTable.reentryTag')}</span>
                    )}
                  </td>
                  <td className="num">{r.entrants.toLocaleString()}</td>
                  <td className="num">
                    {r.entryRank} / {r.entrySeated}
                  </td>
                  <td className="num">{(r.entryChipRatio * 100).toFixed(1)}%</td>
                  <td className="num">
                    {r.finish} / {r.entrants.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
