/**
 * Hand history charts container with async loading and caching
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import Plot from 'react-plotly.js'
import type { Data, Layout } from 'plotly.js-dist-min'
import type { HandHistory } from '../types'
import type { AllInHandData } from '../visualization/handHistory/allInEquityAsync'
import type { ExportChart } from '../export/htmlExport'
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
  progress: { message: string; percentage: number }
}

export interface HandHistoryChartsRef {
  getChartData: () => ExportChart[]
}

// Global cache for equity results (persists across re-renders)
const equityCache = new Map<string, AllInHandData>()
let cachedLuckScore = 0

export const HandHistoryCharts = forwardRef<HandHistoryChartsRef, HandHistoryChartsProps>(
  function HandHistoryCharts({ handHistories }, ref) {
  const [state, setState] = useState<ChartsState>({
    chipHistories: null,
    allInEquity: null,
    handUsage: null,
    isComputing: false,
    progress: { message: '', percentage: 0 },
  })

  const computeIdRef = useRef(0)
  const lastComputedRef = useRef<Set<string>>(new Set())

  useImperativeHandle(ref, () => ({
    getChartData() {
      const charts: ExportChart[] = []
      if (state.chipHistories) charts.push({ name: 'Chip Histories', ...state.chipHistories })
      if (state.handUsage) charts.push({ name: 'Hand Usage Heatmaps', ...state.handUsage })
      if (state.allInEquity) charts.push({ name: 'All-In Equity', ...state.allInEquity })
      return charts
    },
  }))

  useEffect(() => {
    if (handHistories.length === 0) {
      return
    }

    // Check if we have new hands to process
    const currentIds = new Set(handHistories.map(h => h.id))
    const hasNewHands = handHistories.some(h => !lastComputedRef.current.has(h.id))

    if (!hasNewHands && lastComputedRef.current.size > 0) {
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
        progress: { message: 'Loading chart modules...', percentage: 5 },
      }))

      await yieldToBrowser()

      try {
        const [
          { getChipHistoriesData, getHandUsageHeatmapsData },
          { collectAllInDataAsync, createAllInEquityChart },
        ] = await Promise.all([
          import('../visualization'),
          import('../visualization/handHistory/allInEquityAsync'),
        ])

        if (isStale()) return

        // Chip histories (always recompute - fast enough)
        setState(prev => ({
          ...prev,
          progress: { message: 'Generating chip histories...', percentage: 10 },
        }))
        await yieldToBrowser()

        const chipHistories = await getChipHistoriesData(handHistories)
        if (isStale()) return

        setState(prev => ({
          ...prev,
          chipHistories,
          progress: { message: 'Generating hand usage heatmaps...', percentage: 15 },
        }))
        await yieldToBrowser()

        // Hand usage heatmaps (compute before equity)
        const handUsage = await getHandUsageHeatmapsData(handHistories)
        if (isStale()) return

        setState(prev => ({
          ...prev,
          handUsage,
          progress: { message: 'Checking equity cache...', percentage: 20 },
        }))
        await yieldToBrowser()

        // Filter out hands that are already cached
        const uncachedHands = handHistories.filter(h => !equityCache.has(h.id))
        const cachedCount = handHistories.length - uncachedHands.length

        if (uncachedHands.length > 0) {
          setState(prev => ({
            ...prev,
            progress: {
              message: `Found ${cachedCount} cached, calculating ${uncachedHands.length} new...`,
              percentage: 25,
            },
          }))

          // Calculate equity only for uncached hands
          const { data: newAllInData, luckScore: newLuckScore } = await collectAllInDataAsync(
            uncachedHands,
            (current, total) => {
              if (!isStale()) {
                const pct = 25 + Math.floor((current / total) * 70)
                setState(prev => ({
                  ...prev,
                  progress: {
                    message: `Calculating equity: ${current}/${total} all-ins...`,
                    percentage: pct,
                  },
                }))
              }
            }
          )
          if (isStale()) return

          // Add new results to cache
          for (const data of newAllInData) {
            equityCache.set(data.handId, data)
          }

          // Recalculate luck score with all cached data
          // (simplified: we store the latest, but ideally recalculate from all)
          if (newAllInData.length > 0) {
            cachedLuckScore = newLuckScore
          }
        }

        // Get all cached results for current hand histories
        const allCachedData: AllInHandData[] = []
        for (const h of handHistories) {
          const cached = equityCache.get(h.id)
          if (cached) {
            allCachedData.push(cached)
          }
        }

        const allInEquity = createAllInEquityChart(allCachedData, cachedLuckScore)

        setState(prev => ({
          ...prev,
          allInEquity,
          isComputing: false,
          progress: { message: 'Complete', percentage: 100 },
        }))
      } catch (error) {
        console.error('Chart generation failed:', error)
        lastComputedRef.current = new Set() // Allow retry on next render
        setState(prev => ({
          ...prev,
          isComputing: false,
          progress: { message: 'Error generating charts', percentage: 0 },
        }))
      }
    }

    compute()

    return () => {
      computeIdRef.current++ // Invalidate this computation
    }
  }, [handHistories])

  if (handHistories.length === 0) {
    return (
      <div className="no-data">
        <p>No hand history data loaded</p>
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
          <p className="progress-message">{state.progress.message}</p>
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
