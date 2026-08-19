/**
 * "Deep Dive" — analyses that require BOTH tournament summaries and hand histories.
 *
 * This is the only tab that joins the two datasets. Its sections:
 *
 *   Final Table Runs        every final table the Hero reached, matched by the exact
 *                           `Tournament #<id>` key to its official result, so entry state (rank +
 *                           chip share, from the hand history) sits next to the finish and field
 *                           size (from the summary). See `analysis/finalTable.ts`.
 *   Late Registration vs ROI  every entry's depth at its first recorded hand against what the
 *                           entry returned. See `analysis/lateRegistration.ts`.
 *
 * A future joined analysis becomes a new `analysis/*.ts` module plus a new <section> here — never
 * a new tab. The analyses are synchronous, memoized passes, so they re-run exactly when either
 * dataset's array identity changes (i.e. when a later upload adds data). Each section renders only
 * when its own analysis found something; the tab-level empty state means *no* section did.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Plot from './plot'
import type { TournamentSummary, HandHistory } from '../types'
import type { TranslationKey } from '../i18n'
import { analyzeFinalTables, type FinalTableRow } from '../analysis/finalTable'
import { analyzeLateRegistration } from '../analysis/lateRegistration'
import { getLateRegistrationData } from '../visualization/deepDive/lateRegistration'

interface DeepDiveChartsProps {
  tournaments: TournamentSummary[]
  handHistories: HandHistory[]
}

type SortKey = 'date' | 'tournament' | 'entrants' | 'entryRank' | 'entryChipRatio' | 'finish'
interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

// First click on a column sorts it by its most useful direction: names A→Z, chip share and field
// size high→low, but finishing place and entry rank low→high (best first).
const DEFAULT_DIR: Record<SortKey, 'asc' | 'desc'> = {
  date: 'desc',
  tournament: 'asc',
  entrants: 'desc',
  entryRank: 'asc',
  entryChipRatio: 'desc',
  finish: 'asc',
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
  const { t, i18n } = useTranslation()
  const fmt = (n: number) => n.toLocaleString(i18n.language)
  // Default: most recent first, matching how the analysis returns them.
  const [sort, setSort] = useState<SortState>({ key: 'date', dir: 'desc' })

  const result = useMemo(
    () => analyzeFinalTables(tournaments, handHistories),
    [tournaments, handHistories]
  )

  const lateReg = useMemo(
    () => analyzeLateRegistration(tournaments, handHistories),
    [tournaments, handHistories]
  )
  // The figure bakes translated strings into its traces, so it depends on `t` as well.
  const lateRegFigure = useMemo(
    () => (lateReg.entries.length > 0 ? getLateRegistrationData(lateReg, t) : null),
    [lateReg, t]
  )

  const rows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...result.rows].sort((a, b) => compare(a, b, sort.key) * dir)
  }, [result.rows, sort])

  // Clicking the active column flips its direction; a new column starts at its default (above).
  const onSort = (key: SortKey) =>
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: DEFAULT_DIR[key] }
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

  if (result.rows.length === 0 && !lateRegFigure) {
    return (
      <div className="no-data">
        {t('charts.noDeepDiveData')}
        {result.skipped.length > 0 && (
          <p className="chart-caption">
            {t('deepDive.finalTable.skipped', { n: result.skipped.length })}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="charts-container">
      {result.rows.length > 0 && (
        <section className="chart-section">
          <h3>{t('deepDive.finalTable.title')}</h3>
          <p className="chart-caption">
            {t('deepDive.finalTable.subtitle', { n: result.rows.length })}
          </p>
          <p className="chart-caption">{t('deepDive.finalTable.note')}</p>
          {result.skipped.length > 0 && (
            <p className="chart-caption">
              {t('deepDive.finalTable.skipped', { n: result.skipped.length })}
            </p>
          )}
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
                    <td className="num">{fmt(r.entrants)}</td>
                    <td className="num">
                      {r.entryRank} / {r.entrySeated}
                    </td>
                    <td className="num">{(r.entryChipRatio * 100).toFixed(1)}%</td>
                    <td className="num">
                      {r.finish} / {fmt(r.entrants)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {lateRegFigure && (
        <section className="chart-section">
          <h3>{t('deepDive.lateReg.title')}</h3>
          <p className="chart-caption">
            {t('deepDive.lateReg.subtitle', {
              n: lateReg.entries.length,
              m: lateReg.joinedTournaments,
            })}
          </p>
          <p className="chart-caption">{t('deepDive.lateReg.note')}</p>
          <p className="chart-caption">{t('deepDive.lateReg.disclaimer')}</p>
          {lateReg.skippedMismatch > 0 && (
            <p className="chart-caption">
              {t('deepDive.lateReg.skipped', { n: lateReg.skippedMismatch })}
            </p>
          )}
          <Plot
            data={lateRegFigure.traces}
            layout={{ ...lateRegFigure.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: `${lateRegFigure.layout.height ?? 460}px` }}
            config={{ responsive: true }}
          />
        </section>
      )}
    </div>
  )
}
