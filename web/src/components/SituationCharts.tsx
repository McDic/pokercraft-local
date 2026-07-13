/**
 * Preflop situation charts: the ledger, and the hand-class breakdown of one of its rows.
 *
 * Two layers, and the split is what makes the filters feel instant:
 *
 *   situations — classify every hand into the decisions Hero faced. Depends on the hand
 *                histories and nothing else. O(hands), done exactly once.
 *   figures    — the ledger and the class chart. Depend on the situations, the filters, and
 *                the language. Pure, and a filter change is a re-aggregate over an array in
 *                memory.
 *
 * Classifying inside the figure layer would work and would be wrong: every dropdown would
 * re-walk the whole hand history, and a session is tens of thousands of hands.
 *
 * `isComputing` is derived from whether the situations on hand were built from the hand
 * histories currently in props, rather than tracked as a flag — the same reasoning as
 * HandHistoryCharts, and for the same reason: a flag can dip to "idle" for a commit at the
 * seam between layers, which is exactly long enough to export a chart that is not there.
 *
 * The two figures are memoized apart. The ledger does not depend on the class chart's
 * scope, so choosing a different action to break down must not rebuild it.
 */

import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import Plot from './plot'
import type { HandHistory } from '../types'
import type { Classification, OpenerBucket } from '../analysis/preflopSituation'
import { classifyHandHistories } from '../analysis/preflopSituation'
import type {
  SituationFilters,
  StackBucket,
  TableBucket,
} from '../visualization/handHistory/situationFilters'
import {
  DEFAULT_FILTERS,
  MIN_SAMPLE_CHOICES,
  OPENER_BUCKET_KEYS,
  STACK_BUCKET_KEYS,
  TABLE_BUCKET_KEYS,
} from '../visualization/handHistory/situationFilters'
import type { DeltaFigure } from '../visualization/handHistory/deltaFigure'
import { FAMILIES, getSituationLedgerData } from '../visualization/handHistory/situationLedger'
import type { HandClassScope } from '../visualization/handHistory/handClassProfit'
import {
  DEFAULT_SCOPE,
  SCOPE_POSITION_KEYS,
  getHandClassProfitData,
} from '../visualization/handHistory/handClassProfit'
import type { ExportChart } from '../export/htmlExport'

interface SituationChartsProps {
  handHistories: HandHistory[]
}

export interface SituationChartsRef {
  getChartData: () => ExportChart[]
  isComputing: () => boolean
}

/**
 * A figure and its caption, rendered together — the caption is not optional context.
 *
 * It renders even when there are no rows, which is the whole point: the caption is where
 * the counts live, and "you have squeezed from UTG six times, all below the threshold" is
 * exactly what an empty chart needs to say and cannot say from an empty state alone.
 */
function Figure({ figure, emptyMessage }: { figure: DeltaFigure; emptyMessage: string }) {
  return (
    <section className="chart-section">
      {/* Keyed by position, not by text: the lines are a fixed, ordered list, and two
          translations that happen to come out identical would collide on a text key. */}
      {figure.caption.map((line, i) => (
        <p key={i} className="chart-caption">
          {line}
        </p>
      ))}
      {figure.traces.length > 0 ? (
        <Plot
          data={figure.traces}
          layout={{ ...figure.layout, autosize: true }}
          useResizeHandler
          style={{ width: '100%', height: `${figure.layout.height ?? 600}px` }}
          config={{ responsive: true }}
        />
      ) : (
        <div className="no-data">{emptyMessage}</div>
      )}
    </section>
  )
}

export const SituationCharts = forwardRef<SituationChartsRef, SituationChartsProps>(
  function SituationCharts({ handHistories }, ref) {
    const { t } = useTranslation()
    const [filters, setFilters] = useState<SituationFilters>(DEFAULT_FILTERS)
    const [scope, setScope] = useState<HandClassScope>(DEFAULT_SCOPE)

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

    // Deliberately not depending on `scope`: picking a different action to break down must
    // not rebuild the ledger, which does not depend on that choice.
    const handClass = useMemo(
      () =>
        built === null
          ? null
          : getHandClassProfitData(built.classification.situations, filters, scope, t),
      [built, filters, scope, t]
    )

    useImperativeHandle(ref, () => ({
      getChartData(): ExportChart[] {
        const charts: ExportChart[] = []
        // `caption` rides along: how to read these charts is not optional context, and an
        // exported figure that has lost it is the one a reader will misread.
        if (ledger && ledger.traces.length > 0) {
          charts.push({ name: t('chart.situation.name'), ...ledger })
        }
        if (handClass && handClass.traces.length > 0) {
          charts.push({ name: t('chart.handClass.name'), ...handClass })
        }
        return charts
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
                setFilters(f => ({ ...f, openerBucket: e.target.value as OpenerBucket | 'any' }))
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
                setFilters(f => ({ ...f, stackBucket: e.target.value as StackBucket | 'any' }))
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
                setFilters(f => ({ ...f, tableBucket: e.target.value as TableBucket | 'any' }))
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
              onChange={e => setFilters(f => ({ ...f, minSample: Number(e.target.value) }))}
            >
              {MIN_SAMPLE_CHOICES.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {ledger && <Figure figure={ledger} emptyMessage={t('chart.situation.empty')} />}

        {/* The class chart's own two controls, kept beside it rather than in the bar above:
            they do not narrow the data, they choose which row of the ledger to open up. */}
        <div className="situation-filters">
          <label>
            {t('chart.handClass.filter.action')}
            <select
              value={scope.familyIndex}
              onChange={e => setScope(s => ({ ...s, familyIndex: Number(e.target.value) }))}
            >
              {FAMILIES.map((family, i) => (
                <option key={family.key} value={i}>
                  {t(family.key)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('chart.handClass.filter.position')}
            <select
              value={scope.heroOffset ?? 'any'}
              onChange={e =>
                setScope(s => ({
                  ...s,
                  heroOffset: e.target.value === 'any' ? null : Number(e.target.value),
                }))
              }
            >
              {SCOPE_POSITION_KEYS.map(([offset, key]) => (
                <option key={key} value={offset ?? 'any'}>
                  {t(key)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {handClass && <Figure figure={handClass} emptyMessage={t('chart.handClass.empty')} />}
      </div>
    )
  }
)
