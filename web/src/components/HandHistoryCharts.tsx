/**
 * Hand history charts container.
 *
 * Deliberately two layers, in two effects:
 *
 *   data   — the WASM all-in equity pass. Depends on the hand histories and nothing
 *            else. Expensive: it spawns a pool of Web Workers that cannot be aborted.
 *   charts — the Plotly figures. Depends on that data plus the active language.
 *            Cheap, pure, and safe to redo.
 *
 * Keeping them apart is what makes a language switch free: it re-runs only the chart
 * layer, so no equity is ever recomputed and no worker is ever respawned. Folding the
 * two together — the obvious shape, since figures are what the component stores — means
 * the language has to be a dependency of the equity pass too, and switching mid-analysis
 * then supersedes a run whose workers keep going, while its replacement starts a second
 * pool for the same hands.
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import Plot from './plot'
import type { Data, Layout } from 'plotly.js-dist-min'
import type { HandHistory } from '../types'
import type { AllInHandData, LuckScore } from '../visualization/handHistory/allInEquityAsync'
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

interface Progress {
  messageKey: TranslationKey | null
  messageParams?: Record<string, string | number>
  percentage: number
}

/** The language-independent output of the equity pass. */
interface EquityData {
  allInData: AllInHandData[]
  luckScore: LuckScore
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
  const language = i18n.resolvedLanguage

  // --- data layer ---
  const [equity, setEquity] = useState<EquityData | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [dataProgress, setDataProgress] = useState<Progress>({ messageKey: null, percentage: 0 })

  // --- chart layer ---
  const [chipHistories, setChipHistories] = useState<ChartData | null>(null)
  const [handUsage, setHandUsage] = useState<ChartData | null>(null)
  const [allInEquity, setAllInEquity] = useState<ChartData | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawProgress, setDrawProgress] = useState<Progress>({ messageKey: null, percentage: 0 })

  const calcIdRef = useRef(0)
  const drawIdRef = useRef(0)
  const lastComputedRef = useRef<Set<string>>(new Set())

  const isComputing = isCalculating || isDrawing
  // While the equity pass is running, its progress is what the user cares about; the
  // chart layer only ever reports the brief tail.
  const progress = isCalculating ? dataProgress : drawProgress

  useImperativeHandle(ref, () => ({
    getChartData() {
      const charts: ExportChart[] = []
      if (chipHistories) charts.push({ name: t('chart.chipHistories.name'), ...chipHistories })
      if (handUsage) charts.push({ name: t('chart.handUsage.name'), ...handUsage })
      if (allInEquity) charts.push({ name: t('chart.allInEquity.name'), ...allInEquity })
      return charts
    },
    isComputing() {
      return isComputing
    },
  }))

  // ---------------------------------------------------------------------------
  // Data layer: all-in equity. No `t`/`language` dependency, by design.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (handHistories.length === 0) return

    const hasNewHands = handHistories.some(h => !lastComputedRef.current.has(h.id))
    if (!hasNewHands && lastComputedRef.current.size > 0) {
      return // Nothing new to compute.
    }
    // Claim these ids up front, so a re-render with the same data cannot start a
    // second pass.
    lastComputedRef.current = new Set(handHistories.map(h => h.id))

    const thisId = ++calcIdRef.current
    const isStale = () => calcIdRef.current !== thisId

    const calculate = async () => {
      setIsCalculating(true)
      setDataProgress({ messageKey: 'progress.chart.equityCache', percentage: 20 })
      await yieldToBrowser()

      try {
        const { collectAllInDataAsync, calculateLuckScore } = await import(
          '../visualization/handHistory/allInEquityAsync'
        )
        if (isStale()) return

        const uncachedHands = handHistories.filter(h => !equityCache.has(h.id))
        const cachedCount = handHistories.length - uncachedHands.length

        if (uncachedHands.length > 0) {
          setDataProgress({
            messageKey: 'progress.chart.equityCached',
            messageParams: { cached: cachedCount, pending: uncachedHands.length },
            percentage: 25,
          })

          const { data: newAllInData } = await collectAllInDataAsync(
            uncachedHands,
            (current, total) => {
              if (isStale()) return
              setDataProgress({
                messageKey: 'progress.chart.equity',
                messageParams: { current, total },
                percentage: 25 + Math.floor((current / total) * 70),
              })
            }
          )

          // Bank before the staleness check. Equity is keyed by hand id and does not
          // depend on which run produced it, so results are always worth keeping —
          // returning first would throw away every hand this run already paid WASM
          // for, and a run does get superseded, by a second upload landing mid-pass.
          for (const data of newAllInData) {
            equityCache.set(data.handId, data)
          }
          if (isStale()) return
        }

        const allInData = handHistories
          .map(h => equityCache.get(h.id))
          .filter((d): d is AllInHandData => d !== undefined)

        // Luck is scored over every loaded hand, not just the latest batch.
        const luckScore = await calculateLuckScore(allInData)
        if (isStale()) return

        setEquity({ allInData, luckScore })
        setIsCalculating(false)
      } catch (error) {
        console.error('Equity calculation failed:', error)
        if (isStale()) return
        lastComputedRef.current = new Set() // Allow retry on next render
        setIsCalculating(false)
        setDataProgress({ messageKey: 'progress.chart.error', percentage: 0 })
      }
    }

    calculate()

    return () => {
      // Reading the ref's latest value is the intent, not a stale-capture mistake,
      // so the rule's "copy it into a variable" advice does not apply.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      calcIdRef.current++ // Invalidate this pass
    }
  }, [handHistories])

  // ---------------------------------------------------------------------------
  // Chart layer: rebuilt whenever the data or the language changes. Pure and cheap —
  // it never touches WASM, and never spawns a worker.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (handHistories.length === 0) return

    const thisId = ++drawIdRef.current
    const isStale = () => drawIdRef.current !== thisId

    const draw = async () => {
      setIsDrawing(true)
      setDrawProgress({ messageKey: 'progress.chart.loadingModules', percentage: 5 })
      await yieldToBrowser()

      try {
        const [
          { getChipHistoriesData, getHandUsageHeatmapsData },
          { createAllInEquityChart },
        ] = await Promise.all([
          import('../visualization'),
          import('../visualization/handHistory/allInEquityAsync'),
        ])
        if (isStale()) return

        setDrawProgress({ messageKey: 'progress.chart.chipHistories', percentage: 35 })
        await yieldToBrowser()
        const chips = await getChipHistoriesData(handHistories, t)
        if (isStale()) return
        setChipHistories(chips)

        setDrawProgress({ messageKey: 'progress.chart.handUsage', percentage: 70 })
        await yieldToBrowser()
        const usage = await getHandUsageHeatmapsData(handHistories, t)
        if (isStale()) return
        setHandUsage(usage)

        // Absent only while the equity pass is still running; this effect reruns when
        // it lands.
        if (equity) {
          setDrawProgress({ messageKey: 'progress.chart.allInEquity', percentage: 90 })
          await yieldToBrowser()
          const chart = createAllInEquityChart(equity.allInData, equity.luckScore, t)
          if (isStale()) return
          setAllInEquity(chart)
        }

        setIsDrawing(false)
        setDrawProgress({ messageKey: 'progress.chart.complete', percentage: 100 })
      } catch (error) {
        console.error('Chart generation failed:', error)
        if (isStale()) return
        setIsDrawing(false)
        setDrawProgress({ messageKey: 'progress.chart.error', percentage: 0 })
      }
    }

    draw()

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      drawIdRef.current++ // Invalidate this redraw
    }
  }, [handHistories, equity, t, language])

  if (handHistories.length === 0) {
    return (
      <div className="no-data">
        <p>{t('charts.noHandHistoryData')}</p>
      </div>
    )
  }

  return (
    <div className="charts-container">
      {isComputing && (
        <div className="chart-loading">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <p className="progress-message">
            {progress.messageKey && t(progress.messageKey, progress.messageParams)}
          </p>
        </div>
      )}

      {chipHistories && chipHistories.traces.length > 0 && (
        <section className="chart-section">
          <Plot
            data={chipHistories.traces}
            layout={{ ...chipHistories.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '900px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {handUsage && handUsage.traces.length > 0 && (
        <section className="chart-section">
          <Plot
            data={handUsage.traces}
            layout={{ ...handUsage.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '900px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {allInEquity && allInEquity.traces.length > 0 && (
        <section className="chart-section">
          <Plot
            data={allInEquity.traces}
            layout={{ ...allInEquity.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '700px' }}
            config={{ responsive: true }}
          />
        </section>
      )}
    </div>
  )
})
