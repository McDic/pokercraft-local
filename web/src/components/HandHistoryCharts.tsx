/**
 * Hand history charts container with async loading and caching
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import Plot from './plot'
import type { Data, Layout } from 'plotly.js-dist-min'
import type { HandHistory } from '../types'
import type { AllInHandData } from '../visualization/handHistory/allInEquityAsync'
import type { ExportChart } from '../export/htmlExport'
import type { TranslationKey } from '../i18n'
import { yieldToBrowser } from '../utils'

interface ChartData {
  traces: Data[]
  layout: Partial<Layout>
}

interface HandHistoryChartsProps {
  handHistories: HandHistory[]
}

interface ChartsState {
  chipHistories: ChartData | null
  allInEquity: ChartData | null
  handUsage: ChartData | null
  isComputing: boolean
  progress: {
    messageKey: TranslationKey | null
    messageParams?: Record<string, string | number>
    percentage: number
  }
}

export interface HandHistoryChartsRef {
  getChartData: () => ExportChart[]
  isComputing: () => boolean
}

// Global cache for equity results (persists across re-renders)
const equityCache = new Map<string, AllInHandData>()

export const HandHistoryCharts = forwardRef<HandHistoryChartsRef, HandHistoryChartsProps>(
  function HandHistoryCharts({ handHistories }, ref) {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState<ChartsState>({
    chipHistories: null,
    allInEquity: null,
    handUsage: null,
    isComputing: false,
    progress: { messageKey: null, percentage: 0 },
  })

  const computeIdRef = useRef(0)
  const lastComputedRef = useRef<Set<string>>(new Set())
  const lastLanguageRef = useRef<string | undefined>(undefined)

  useImperativeHandle(ref, () => ({
    getChartData() {
      const charts: ExportChart[] = []
      if (state.chipHistories) {
        charts.push({ name: t('chart.chipHistories.name'), ...state.chipHistories })
      }
      if (state.handUsage) charts.push({ name: t('chart.handUsage.name'), ...state.handUsage })
      if (state.allInEquity) charts.push({ name: t('chart.allInEquity.name'), ...state.allInEquity })
      return charts
    },
    isComputing() {
      return state.isComputing
    },
  }))

  const language = i18n.resolvedLanguage

  useEffect(() => {
    if (handHistories.length === 0) {
      return
    }

    // Check if we have new hands to process
    const currentIds = new Set(handHistories.map(h => h.id))
    const hasNewHands = handHistories.some(h => !lastComputedRef.current.has(h.id))

    // A language switch brings no new hands, so it has to be able to get past the
    // skip below — otherwise the charts would keep their old-language labels until
    // the next file was loaded. Once the equity pass has finished, this rebuild costs
    // nothing extra: every hand is in `equityCache`, so `uncachedHands` is empty and
    // only the figures are reassembled. Switching *during* the equity pass restarts
    // the hands still outstanding, but not the ones already banked (see the cache
    // write below, which deliberately happens before the staleness check).
    const languageChanged = lastLanguageRef.current !== language
    lastLanguageRef.current = language

    if (!hasNewHands && !languageChanged && lastComputedRef.current.size > 0) {
      return // No new data, skip recomputation
    }

    // Mark current IDs immediately to prevent duplicate computations
    // from re-renders with the same data
    lastComputedRef.current = currentIds

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
        const [
          { getChipHistoriesData, getHandUsageHeatmapsData },
          { collectAllInDataAsync, createAllInEquityChart, calculateLuckScore },
        ] = await Promise.all([
          import('../visualization'),
          import('../visualization/handHistory/allInEquityAsync'),
        ])

        if (isStale()) return

        // Chip histories (always recompute - fast enough)
        setState(prev => ({
          ...prev,
          progress: { messageKey: 'progress.chart.chipHistories', percentage: 10 },
        }))
        await yieldToBrowser()

        const chipHistories = await getChipHistoriesData(handHistories, t)
        if (isStale()) return

        setState(prev => ({
          ...prev,
          chipHistories,
          progress: { messageKey: 'progress.chart.handUsage', percentage: 15 },
        }))
        await yieldToBrowser()

        // Hand usage heatmaps (compute before equity)
        const handUsage = await getHandUsageHeatmapsData(handHistories, t)
        if (isStale()) return

        setState(prev => ({
          ...prev,
          handUsage,
          progress: { messageKey: 'progress.chart.equityCache', percentage: 20 },
        }))
        await yieldToBrowser()

        // Filter out hands that are already cached
        const uncachedHands = handHistories.filter(h => !equityCache.has(h.id))
        const cachedCount = handHistories.length - uncachedHands.length

        if (uncachedHands.length > 0) {
          setState(prev => ({
            ...prev,
            progress: {
              messageKey: 'progress.chart.equityCached',
              messageParams: { cached: cachedCount, pending: uncachedHands.length },
              percentage: 25,
            },
          }))

          // Calculate equity only for uncached hands
          const { data: newAllInData } = await collectAllInDataAsync(
            uncachedHands,
            (current, total) => {
              if (!isStale()) {
                const pct = 25 + Math.floor((current / total) * 70)
                setState(prev => ({
                  ...prev,
                  progress: {
                    messageKey: 'progress.chart.equity',
                    messageParams: { current, total },
                    percentage: pct,
                  },
                }))
              }
            }
          )

          // Bank the results BEFORE the staleness check. Equity is keyed by hand id
          // and does not depend on which run computed it, so it is always worth
          // keeping — whereas returning first would throw away every hand this run
          // already paid WASM for. That is not hypothetical: switching language
          // mid-analysis supersedes this run, and discarding here would make the
          // replacement run recompute the whole batch from an empty cache.
          for (const data of newAllInData) {
            equityCache.set(data.handId, data)
          }

          if (isStale()) return
        }

        // Get all cached results for current hand histories
        const allCachedData: AllInHandData[] = []
        for (const h of handHistories) {
          const cached = equityCache.get(h.id)
          if (cached) {
            allCachedData.push(cached)
          }
        }

        // Recalculate luck score from all loaded hands (not just the latest batch)
        const luckScore = await calculateLuckScore(allCachedData)
        if (isStale()) return

        const allInEquity = createAllInEquityChart(allCachedData, luckScore, t)

        setState(prev => ({
          ...prev,
          allInEquity,
          isComputing: false,
          progress: { messageKey: 'progress.chart.complete', percentage: 100 },
        }))
      } catch (error) {
        console.error('Chart generation failed:', error)
        lastComputedRef.current = new Set() // Allow retry on next render
        setState(prev => ({
          ...prev,
          isComputing: false,
          progress: { messageKey: 'progress.chart.error', percentage: 0 },
        }))
      }
    }

    compute()

    return () => {
      computeIdRef.current++ // Invalidate this computation
    }
  }, [handHistories, t, language])

  if (handHistories.length === 0) {
    return (
      <div className="no-data">
        <p>{t('charts.noHandHistoryData')}</p>
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
            {state.progress.messageKey &&
              t(state.progress.messageKey, state.progress.messageParams)}
          </p>
        </div>
      )}

      {state.chipHistories && state.chipHistories.traces.length > 0 && (
        <section className="chart-section">
          <Plot
            data={state.chipHistories.traces}
            layout={{ ...state.chipHistories.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '900px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {state.handUsage && state.handUsage.traces.length > 0 && (
        <section className="chart-section">
          <Plot
            data={state.handUsage.traces}
            layout={{ ...state.handUsage.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '900px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {state.allInEquity && state.allInEquity.traces.length > 0 && (
        <section className="chart-section">
          <Plot
            data={state.allInEquity.traces}
            layout={{ ...state.allInEquity.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '700px' }}
            config={{ responsive: true }}
          />
        </section>
      )}
    </div>
  )
})
