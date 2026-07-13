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
import type { Classification } from '../analysis/preflopSituation'
import { classifyHandHistories } from '../analysis/preflopSituation'
import type { SituationFilters } from '../visualization/handHistory/situationFilters'
import { DEFAULT_FILTERS } from '../visualization/handHistory/situationFilters'
import type { Control } from '../visualization/handHistory/situationControls'
import {
  FILTER_CONTROLS,
  SCOPE_CONTROLS,
} from '../visualization/handHistory/situationControls'
import type { DeltaFigure } from '../visualization/handHistory/deltaFigure'
import { getSituationLedgerData } from '../visualization/handHistory/situationLedger'
import type { HandClassScope } from '../visualization/handHistory/handClassProfit'
import { DEFAULT_SCOPE, getHandClassProfitData } from '../visualization/handHistory/handClassProfit'
import type { SituationExport } from '../export/situationPayload'
import { exportableSituations } from '../export/situationPayload'
import en from '../i18n/locales/en.json'

interface SituationChartsProps {
  handHistories: HandHistory[]
}

export interface SituationChartsRef {
  /**
   * The decisions, not the pictures — see situationPayload.ts.
   *
   * Unlike the other two tabs, this one does not export figures. Its charts only mean
   * anything next to the filters that produced them, so the exported file gets working
   * dropdowns and the data to re-aggregate behind them.
   */
  getExportPayload: () => SituationExport | null
  isComputing: () => boolean
}

/**
 * A row of `<select>`s, laid out from the shared control descriptors.
 *
 * The descriptors — the options, and what picking one does to the state — live in
 * `situationControls.ts`, because the exported HTML has this same filter bar and had to be
 * given the same answers. This component is only the JSX half; `renderControls` in
 * `export/situationRuntime.ts` is the DOM half. Neither may decide anything.
 */
function ControlBar<S>({
  controls,
  state,
  onChange,
}: {
  controls: Array<Control<S>>
  state: S
  onChange: (next: S) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="situation-filters">
      {controls.map(control => (
        <label key={control.id}>
          {t(control.labelKey)}
          <select
            value={control.valueOf(state)}
            onChange={e => onChange(control.apply(state, e.target.value))}
          >
            {control.options(t).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
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
    const { t, i18n } = useTranslation()
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
      getExportPayload(): SituationExport | null {
        if (built === null) return null

        return {
          rows: exportableSituations(built.classification.situations),
          // Whatever is on screen right now: the file opens showing the chart you exported,
          // and the dropdowns then move from there.
          filters,
          scope,
          // The whole dictionary, resolved the way i18next resolves it — the current
          // language over the English fallback. Not the subset the charts use today: that
          // list would fall behind the code, and the first thing it dropped would render in
          // the exported file as a raw `chart.situation.family.squeeze`.
          strings: {
            ...(en as Record<string, string>),
            ...(i18n.getResourceBundle(i18n.resolvedLanguage ?? 'en', 'translation') ?? {}),
          },
          droppedHands: built.classification.droppedHands,
        }
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
        <ControlBar controls={FILTER_CONTROLS} state={filters} onChange={setFilters} />

        {ledger && <Figure figure={ledger} emptyMessage={t('chart.situation.empty')} />}

        {/* The class chart's own two controls, kept beside it rather than in the bar above:
            they do not narrow the data, they choose which row of the ledger to open up. */}
        <ControlBar controls={SCOPE_CONTROLS} state={scope} onChange={setScope} />

        {handClass && <Figure figure={handClass} emptyMessage={t('chart.handClass.empty')} />}
      </div>
    )
  }
)
