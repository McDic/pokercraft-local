/**
 * Preflop situation charts.
 *
 * Two layers, and the split is what makes the filters feel instant:
 *
 *   situations — classify every hand into the decisions Hero faced. Depends on the hand
 *                histories and nothing else. O(hands), done exactly once.
 *   figure     — the ledger. Depends on the situations, the filters, and the language.
 *                Pure, and a filter change is a re-aggregate over an array in memory.
 *
 * Classifying inside the figure layer would work and would be wrong: every dropdown would
 * re-walk the whole hand history, and a session is tens of thousands of hands.
 *
 * `isComputing` is derived from whether the situations on hand were built from the hand
 * histories currently in props, rather than tracked as a flag — the same reasoning as
 * HandHistoryCharts, and for the same reason: a flag can dip to "idle" for a commit at the
 * seam between layers, which is exactly long enough to export a chart that is not there.
 */

import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import Plot from './plot'
import type { HandHistory } from '../types'
import type { Classification, OpenerBucket } from '../analysis/preflopSituation'
import { classifyHandHistories } from '../analysis/preflopSituation'
import type {
  LedgerFilters,
  StackBucket,
  TableBucket,
} from '../visualization/handHistory/situationLedger'
import {
  DEFAULT_FILTERS,
  MIN_SAMPLE_CHOICES,
  OPENER_BUCKET_KEYS,
  STACK_BUCKET_KEYS,
  TABLE_BUCKET_KEYS,
  getSituationLedgerData,
} from '../visualization/handHistory/situationLedger'
import type { ExportChart } from '../export/htmlExport'

interface SituationChartsProps {
  handHistories: HandHistory[]
}

export interface SituationChartsRef {
  getChartData: () => ExportChart[]
  isComputing: () => boolean
}

export const SituationCharts = forwardRef<SituationChartsRef, SituationChartsProps>(
  function SituationCharts({ handHistories }, ref) {
    const { t } = useTranslation()
    const [filters, setFilters] = useState<LedgerFilters>(DEFAULT_FILTERS)

    // Carries the input it was built from, so staleness is a fact rather than a flag.
    const [built, setBuilt] = useState<{
      classification: Classification
      from: HandHistory[]
    } | null>(null)

    useEffect(() => {
      let cancelled = false
      classifyHandHistories(handHistories).then(classification => {
        if (!cancelled) setBuilt({ classification, from: handHistories })
      })
      return () => {
        cancelled = true
      }
    }, [handHistories])

    const isComputing = built === null || built.from !== handHistories

    const ledger = useMemo(
      () =>
        built === null
          ? null
          : getSituationLedgerData(
              built.classification.situations,
              filters,
              t,
              built.classification.droppedHands
            ),
      [built, filters, t]
    )

    useImperativeHandle(ref, () => ({
      getChartData(): ExportChart[] {
        if (!ledger || ledger.traces.length === 0) return []
        // `caption` rides along: how to read this chart is not optional context, and an
        // exported figure that has lost it is the one a reader will misread.
        return [{ name: t('chart.situation.name'), ...ledger }]
      },
      isComputing() {
        return isComputing
      },
    }))

    if (handHistories.length === 0) {
      return <div className="no-data">{t('charts.noSituationData')}</div>
    }

    return (
      <div className="charts-container">
        <div className="situation-filters">
          <label>
            {t('chart.situation.filter.opener')}
            <select
              value={filters.openerBucket}
              onChange={e =>
                setFilters(f => ({
                  ...f,
                  openerBucket: e.target.value as OpenerBucket | 'any',
                }))
              }
            >
              <option value="any">{t('chart.situation.filter.any')}</option>
              {OPENER_BUCKET_KEYS.map(([bucket, key]) => (
                <option key={bucket} value={bucket}>
                  {t(key)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('chart.situation.filter.stack')}
            <select
              value={filters.stackBucket}
              onChange={e =>
                setFilters(f => ({
                  ...f,
                  stackBucket: e.target.value as StackBucket | 'any',
                }))
              }
            >
              <option value="any">{t('chart.situation.filter.any')}</option>
              {STACK_BUCKET_KEYS.map(([bucket, key]) => (
                <option key={bucket} value={bucket}>
                  {t(key)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('chart.situation.filter.table')}
            <select
              value={filters.tableBucket}
              onChange={e =>
                setFilters(f => ({
                  ...f,
                  tableBucket: e.target.value as TableBucket | 'any',
                }))
              }
            >
              <option value="any">{t('chart.situation.filter.any')}</option>
              {TABLE_BUCKET_KEYS.map(([bucket, key]) => (
                <option key={bucket} value={bucket}>
                  {t(key)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('chart.situation.filter.minSample')}
            <select
              value={filters.minSample}
              onChange={e =>
                setFilters(f => ({ ...f, minSample: Number(e.target.value) }))
              }
            >
              {MIN_SAMPLE_CHOICES.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {ledger && ledger.traces.length > 0 ? (
          <section className="chart-section">
            {/* Keyed by position, not by text: the lines are a fixed, ordered list, and two
                translations that happen to come out identical would collide on a text key. */}
            {ledger.caption.map((line, i) => (
              <p key={i} className="chart-caption">
                {line}
              </p>
            ))}
            <Plot
              data={ledger.traces}
              layout={{ ...ledger.layout, autosize: true }}
              useResizeHandler
              style={{ width: '100%', height: `${ledger.layout.height ?? 600}px` }}
              config={{ responsive: true }}
            />
          </section>
        ) : (
          !isComputing && <div className="no-data">{t('chart.situation.empty')}</div>
        )}
      </div>
    )
  }
)
