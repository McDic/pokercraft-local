/**
 * Tournament summary charts container with async loading
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import Plot from './plot'
import type { Data, Layout } from 'plotly.js-dist-min'
import type { TournamentSummary } from '../types'
import type { BankrollWorkerResult } from '../workers/analysisWorker'
import type { ExportChart } from '../export/htmlExport'
import type { TranslationKey } from '../i18n'
import { yieldToBrowser } from '../utils'

interface ChartData {
  traces: Data[]
  layout: Partial<Layout>
}

interface TournamentChartsProps {
  tournaments: TournamentSummary[]
  bankrollResults: BankrollWorkerResult[]
}

interface ChartsState {
  historical: ChartData | null
  rre: ChartData | null
  bankroll: ChartData | null
  prizePies: ChartData | null
  rrByRank: ChartData | null
  isComputing: boolean
  progress: { messageKey: TranslationKey | null; percentage: number }
}

export interface TournamentChartsRef {
  getChartData: () => ExportChart[]
  isComputing: () => boolean
}

export const TournamentCharts = forwardRef<TournamentChartsRef, TournamentChartsProps>(
  function TournamentCharts({ tournaments, bankrollResults }, ref) {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState<ChartsState>({
    historical: null,
    rre: null,
    bankroll: null,
    prizePies: null,
    rrByRank: null,
    isComputing: false,
    progress: { messageKey: null, percentage: 0 },
  })

  const computeIdRef = useRef(0)

  useImperativeHandle(ref, () => ({
    getChartData() {
      const charts: ExportChart[] = []
      if (state.historical) charts.push({ name: t('chart.historical.name'), ...state.historical })
      if (state.rre) charts.push({ name: t('chart.rre.name'), ...state.rre })
      if (state.bankroll) charts.push({ name: t('chart.bankroll.name'), ...state.bankroll })
      if (state.prizePies) charts.push({ name: t('chart.prizePies.name'), ...state.prizePies })
      if (state.rrByRank) charts.push({ name: t('chart.rrByRank.name'), ...state.rrByRank })
      return charts
    },
    isComputing() {
      return state.isComputing
    },
  }))

  // Both props keep their identity while their contents are unchanged, so the
  // dependency list alone decides when to redraw. Do not reintroduce a
  // count-based skip here: a bankroll run always returns one result per initial
  // capital, so its length is identical even when every number in it changed,
  // and the fresh results would be dropped.
  //
  // `language` is a dependency because every title, axis, and legend string is
  // baked into the figure at build time. These builders are pure and synchronous
  // over already-parsed data, so rebuilding them on a language switch is cheap.
  const language = i18n.resolvedLanguage

  useEffect(() => {
    if (tournaments.length === 0) return

    // Any compute started later supersedes this one.
    const thisComputeId = ++computeIdRef.current
    const isStale = () => computeIdRef.current !== thisComputeId

    const compute = async () => {
      setState(prev => ({
        ...prev,
        isComputing: true,
        progress: { messageKey: 'progress.chart.loadingModules', percentage: 5 },
      }))

      await yieldToBrowser()

      try {
        const {
          getHistoricalPerformanceData,
          getRREHeatmapData,
          getPrizePiesData,
          getRRByRankData,
          getBankrollAnalysisData,
        } = await import('../visualization')

        if (isStale()) return

        // Historical Performance
        setState(prev => ({
          ...prev,
          progress: { messageKey: 'progress.chart.historical', percentage: 15 },
        }))
        await yieldToBrowser()

        const historical = getHistoricalPerformanceData(tournaments, t)
        if (isStale()) return

        setState(prev => ({ ...prev, historical }))
        await yieldToBrowser()

        // RRE Heatmap
        setState(prev => ({
          ...prev,
          progress: { messageKey: 'progress.chart.rre', percentage: 30 },
        }))
        await yieldToBrowser()

        const rre = getRREHeatmapData(tournaments, t)
        if (isStale()) return

        setState(prev => ({ ...prev, rre }))
        await yieldToBrowser()

        // Prize Pies
        setState(prev => ({
          ...prev,
          progress: { messageKey: 'progress.chart.prizePies', percentage: 50 },
        }))
        await yieldToBrowser()

        const prizePies = getPrizePiesData(tournaments, t)
        if (isStale()) return

        setState(prev => ({ ...prev, prizePies }))
        await yieldToBrowser()

        // RR by Rank
        setState(prev => ({
          ...prev,
          progress: { messageKey: 'progress.chart.rrByRank', percentage: 70 },
        }))
        await yieldToBrowser()

        const rrByRank = getRRByRankData(tournaments, t)
        if (isStale()) return

        setState(prev => ({ ...prev, rrByRank }))
        await yieldToBrowser()

        // Bankroll Analysis (if available)
        if (bankrollResults.length > 0) {
          setState(prev => ({
            ...prev,
            progress: { messageKey: 'progress.chart.bankroll', percentage: 85 },
          }))
          await yieldToBrowser()

          const bankroll = getBankrollAnalysisData(bankrollResults, t)
          if (isStale()) return

          setState(prev => ({ ...prev, bankroll }))
        }

        // Without this check a superseded compute would report "Complete" over a
        // live one, clearing the progress bar and the export's still-calculating
        // guard while the newest charts are still being generated.
        if (isStale()) return

        setState(prev => ({
          ...prev,
          isComputing: false,
          progress: { messageKey: 'progress.chart.complete', percentage: 100 },
        }))
      } catch (error) {
        console.error('Chart generation failed:', error)
        if (isStale()) return

        setState(prev => ({
          ...prev,
          isComputing: false,
          progress: { messageKey: 'progress.chart.error', percentage: 0 },
        }))
      }
    }

    compute()

    return () => {
      // Supersede the in-flight compute on unmount / prop change. Reading the
      // ref's latest value here is the intent, not a stale-capture mistake, so
      // the rule's "copy it into a variable" advice does not apply.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      computeIdRef.current++
    }
    // `t` is a stable identity per language in react-i18next, and `language` is
    // listed explicitly to make the language dependency obvious at a glance.
  }, [tournaments, bankrollResults, t, language])

  if (tournaments.length === 0) {
    return (
      <div className="no-data">
        <p>{t('charts.noTournamentData')}</p>
      </div>
    )
  }

  return (
    <div className="charts-container">
      {state.isComputing && (
        <div className="chart-loading">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${state.progress.percentage}%` }}
            />
          </div>
          <p className="progress-message">
            {state.progress.messageKey && t(state.progress.messageKey)}
          </p>
        </div>
      )}

      {state.historical && (
        <section className="chart-section">
          <Plot
            data={state.historical.traces}
            layout={{ ...state.historical.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: state.historical.layout.height }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {state.rre && (
        <section className="chart-section">
          <Plot
            data={state.rre.traces}
            layout={{ ...state.rre.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: state.rre.layout.height }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {state.bankroll && (
        <section className="chart-section">
          <Plot
            data={state.bankroll.traces}
            layout={{ ...state.bankroll.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: state.bankroll.layout.height }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {state.prizePies && (
        <section className="chart-section">
          <Plot
            data={state.prizePies.traces}
            layout={{ ...state.prizePies.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: state.prizePies.layout.height }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {state.rrByRank && (
        <section className="chart-section">
          <Plot
            data={state.rrByRank.traces}
            layout={{ ...state.rrByRank.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: state.rrByRank.layout.height }}
            config={{ responsive: true }}
          />
        </section>
      )}
    </div>
  )
})
