/**
 * Hand history charts container.
 *
 * Three layers, in three effects, split along what each actually depends on:
 *
 *   data          — the WASM all-in equity pass. Depends on the hand histories, and
 *                   nothing else. Expensive: a pool of Web Workers that cannot be
 *                   aborted once started.
 *   hand figures  — chip histories and hand-usage heatmaps. Depend on the hand
 *                   histories and the language. Cheap and pure.
 *   equity figure — the all-in equity chart. Depends on the equity data and the
 *                   language. Cheap and pure.
 *
 * Keeping the data layer separate is what makes a language switch free: it rebuilds
 * only figures, so no equity is recomputed and no worker respawned. Keeping the two
 * figure layers separate is what stops an equity result from pointlessly rebuilding
 * the chip histories, which do not depend on it.
 *
 * `isComputing` is *derived* — "some figure on screen does not match the data and
 * language it should have been built from" — rather than tracked as a flag per effect.
 * Flags are what let the export gate read "idle" for one commit at the seam between two
 * layers, which is enough to export a chart set with the equity figure silently missing.
 * Derived state cannot dip: the moment `equity` changes, the equity figure is stale by
 * definition, in the very same commit.
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import Plot from './plot'
import { ChartCaption } from './ChartCaption'
import type { Data, Layout } from 'plotly.js-dist-min'
import type { HandHistory } from '../types'
import type { AllInHandData, LuckScore } from '../visualization/handHistory/allInEquityAsync'
import type { ExportChart } from '../export/htmlExport'
import type { TranslationKey } from '../i18n'
import { yieldToBrowser } from '../utils'

interface ChartData {
  traces: Data[]
  layout: Partial<Layout>
  /** Explanatory paragraphs shown above the figure (and carried into the export). */
  caption: string[]
}

interface HandHistoryChartsProps {
  handHistories: HandHistory[]
}

interface Progress {
  messageKey: TranslationKey | null
  messageParams?: Record<string, string | number>
  percentage: number
}

/** The three things this component computes, each of which can fail on its own. */
type Layer = 'data' | 'handFigures' | 'equityFigure'

/** The language-independent output of the equity pass. */
interface EquityData {
  allInData: AllInHandData[]
  luckScore: LuckScore
}

/**
 * A figure, together with the inputs it was built from.
 *
 * Carrying the provenance is what makes staleness a fact about the state rather than a
 * flag someone has to remember to set and clear in every exit path.
 */
interface Built<T, From> {
  figure: T
  from: From
  language: string | undefined
}

export interface HandHistoryChartsRef {
  getChartData: () => ExportChart[]
  isComputing: () => boolean
}

export const HandHistoryCharts = forwardRef<HandHistoryChartsRef, HandHistoryChartsProps>(
  function HandHistoryCharts({ handHistories }, ref) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage

  const [equity, setEquity] = useState<EquityData | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [dataProgress, setDataProgress] = useState<Progress>({ messageKey: null, percentage: 0 })

  const [handFigures, setHandFigures] = useState<Built<
    { chipHistories: ChartData; handUsage: ChartData },
    HandHistory[]
  > | null>(null)
  const [equityFigure, setEquityFigure] = useState<Built<ChartData, EquityData> | null>(null)
  const [drawProgress, setDrawProgress] = useState<Progress>({ messageKey: null, percentage: 0 })

  // Kept apart from `progress`, because the progress block only renders while work is
  // outstanding — so writing a failure into it was exactly what hid the failure. The
  // only trace a user got of a broken chart was a console line they never opened.
  //
  // Per layer, not one shared slot: each layer retries independently (a language switch
  // reruns the figures but not the equity pass), so a shared slot would either leave a
  // failure on screen after the layer that raised it had recovered, or let a recovering
  // layer wipe another layer's still-live failure.
  const [failures, setFailures] = useState<Partial<Record<Layer, TranslationKey>>>({})

  const fail = (layer: Layer, message: TranslationKey) =>
    setFailures(prev => ({ ...prev, [layer]: message }))

  const clearFailure = (layer: Layer) =>
    setFailures(prev => {
      if (!(layer in prev)) return prev // keep identity, so this cannot loop a render
      const next = { ...prev }
      delete next[layer]
      return next
    })

  const failureMessages = [...new Set(Object.values(failures))]

  const calcIdRef = useRef(0)
  const handsIdRef = useRef(0)
  const equityIdRef = useRef(0)
  const lastComputedRef = useRef<Set<string>>(new Set())

  const hasHands = handHistories.length > 0

  // Derived staleness. A figure is stale when it was not built from the data and
  // language currently in effect — which is true the instant those change, with no
  // window in between.
  const handFiguresStale =
    hasHands &&
    (handFigures === null ||
      handFigures.from !== handHistories ||
      handFigures.language !== language)

  const equityFigureStale =
    hasHands &&
    equity !== null &&
    (equityFigure === null || equityFigure.from !== equity || equityFigure.language !== language)

  // A layer that has failed is not "outstanding" — it is finished, badly. Counting it as
  // still working would leave the progress bar spinning under the error banner for the
  // rest of the session, and hold the export gate shut on charts that are never coming.
  // The banner says what is missing; the user can still export what did build.
  const isComputing =
    isCalculating ||
    (handFiguresStale && !failures.handFigures) ||
    (equityFigureStale && !failures.equityFigure)

  // The equity pass is the slow one, so its message is the one worth showing while it
  // runs. The bar itself is derived rather than taken from whichever layer wrote last:
  // the two figure layers run concurrently, so a shared percentage would jump backwards
  // whenever the slower one reported after the faster one had already claimed 100%.
  const progressMessage = isCalculating ? dataProgress : drawProgress
  const progressPercentage = isCalculating
    ? dataProgress.percentage // 25 → 85 across the WASM pass
    : equity === null
      ? 10 // before the pass starts, or after it failed
      : 90 // figures being built or relabelled; brief, and never WASM

  useImperativeHandle(ref, () => ({
    getChartData() {
      const charts: ExportChart[] = []
      if (handFigures) {
        charts.push({ name: t('chart.chipHistories.name'), ...handFigures.figure.chipHistories })
        charts.push({ name: t('chart.handUsage.name'), ...handFigures.figure.handUsage })
      }
      if (equityFigure) {
        charts.push({ name: t('chart.allInEquity.name'), ...equityFigure.figure })
      }
      return charts
    },
    isComputing() {
      return isComputing
    },
  }))

  // ---------------------------------------------------------------------------
  // Data layer: the all-in equity pass. No `t`/`language` dependency, by design.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hasHands) return

    const hasNewHands = handHistories.some(h => !lastComputedRef.current.has(h.id))
    if (!hasNewHands && lastComputedRef.current.size > 0) {
      return // Nothing new to compute.
    }

    const thisId = ++calcIdRef.current
    const isStale = () => calcIdRef.current !== thisId
    // Claim these ids only once this pass is definitely going ahead, so the early
    // return above can never leave them claimed by a pass that never ran.
    lastComputedRef.current = new Set(handHistories.map(h => h.id))

    const calculate = async () => {
      setIsCalculating(true)
      clearFailure('data')
      setDataProgress({ messageKey: 'progress.chart.equityCache', percentage: 25 })
      await yieldToBrowser()

      try {
        const [{ loadEquity }, { calculateLuckScore }] = await Promise.all([
          import('../visualization/handHistory/equityStore'),
          import('../visualization/handHistory/allInEquityAsync'),
        ])
        if (isStale()) return

        // `loadEquity` owns both the cache and the record of what is currently being
        // computed, so this pass never re-does a hand that an earlier, still-running
        // pass is already working on — it waits for it instead.
        const allInData = await loadEquity(handHistories, (current, total) => {
          if (isStale()) return
          setDataProgress({
            messageKey: 'progress.chart.equity',
            messageParams: { current, total },
            percentage: 30 + Math.floor((current / total) * 55),
          })
        })
        if (isStale()) return

        // Luck is scored over every loaded hand, not just the latest batch.
        const luckScore = await calculateLuckScore(allInData)
        if (isStale()) return

        // Batched into one commit with the handover below, so the progress bar moves
        // forwards into the equity figure's range instead of snapping back to whatever
        // the hand figures left behind.
        setDrawProgress({ messageKey: 'progress.chart.allInEquity', percentage: 90 })
        setEquity({ allInData, luckScore })
        setIsCalculating(false)
      } catch (err) {
        console.error('Equity calculation failed:', err)
        if (isStale()) return
        lastComputedRef.current = new Set() // Allow a retry on the next upload
        setIsCalculating(false)
        fail('data', 'charts.equityFailed')
      }
    }

    calculate()

    // NOTE: no invalidation on cleanup. A pass that really is being replaced is
    // superseded by its replacement incrementing the id above. Bumping here as well
    // would also fire on an effect re-run that then *early-returns* — invalidating the
    // pass in flight with nothing to take over from it, so `isCalculating` would stay
    // true forever and the export would sit behind the "still calculating" modal for
    // good. Unmount is handled by the dedicated effect below.
  }, [handHistories, hasHands])

  // ---------------------------------------------------------------------------
  // Figures built from the hands. Independent of the equity pass, so an equity result
  // landing does not rebuild them.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hasHands) return

    const thisId = ++handsIdRef.current
    const isStale = () => handsIdRef.current !== thisId

    const draw = async () => {
      clearFailure('handFigures')
      setDrawProgress({ messageKey: 'progress.chart.loadingModules', percentage: 5 })
      await yieldToBrowser()

      try {
        const { getChipHistoriesData, getHandUsageHeatmapsData } = await import(
          '../visualization'
        )
        if (isStale()) return

        setDrawProgress({ messageKey: 'progress.chart.chipHistories', percentage: 10 })
        await yieldToBrowser()
        const chipHistories = await getChipHistoriesData(handHistories, t)
        if (isStale()) return

        setDrawProgress({ messageKey: 'progress.chart.handUsage', percentage: 15 })
        await yieldToBrowser()
        const handUsage = await getHandUsageHeatmapsData(handHistories, t)
        if (isStale()) return

        setHandFigures({
          figure: { chipHistories, handUsage },
          from: handHistories,
          language,
        })
      } catch (err) {
        console.error('Chart generation failed:', err)
        if (isStale()) return
        fail('handFigures', 'charts.buildFailed')
      }
    }

    draw()

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      handsIdRef.current++ // Supersede this redraw
    }
  }, [handHistories, hasHands, t, language])

  // ---------------------------------------------------------------------------
  // The figure built from the equity data.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hasHands || equity === null) return

    const thisId = ++equityIdRef.current
    const isStale = () => equityIdRef.current !== thisId

    const draw = async () => {
      clearFailure('equityFigure')
      try {
        const { createAllInEquityChart } = await import(
          '../visualization/handHistory/allInEquityAsync'
        )
        if (isStale()) return

        const figure = createAllInEquityChart(equity.allInData, equity.luckScore, t)
        if (isStale()) return

        setEquityFigure({ figure, from: equity, language })
      } catch (err) {
        console.error('All-in equity chart failed:', err)
        if (isStale()) return
        fail('equityFigure', 'charts.buildFailed')
      }
    }

    draw()

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      equityIdRef.current++ // Supersede this redraw
    }
  }, [equity, hasHands, t, language])

  // Invalidate anything in flight when the component actually goes away.
  useEffect(
    () => () => {
      calcIdRef.current++
      handsIdRef.current++
      equityIdRef.current++
    },
    []
  )

  if (!hasHands) {
    return (
      <div className="no-data">
        <p>{t('charts.noHandHistoryData')}</p>
      </div>
    )
  }

  const chipHistories = handFigures?.figure.chipHistories
  const handUsage = handFigures?.figure.handUsage
  const allInEquity = equityFigure?.figure

  return (
    <div className="charts-container">
      {failureMessages.length > 0 && (
        <div className="chart-error" role="alert">
          {failureMessages.map(message => (
            <p key={message}>{t(message)}</p>
          ))}
        </div>
      )}

      {isComputing && (
        <div className="chart-loading">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <p className="progress-message">
            {progressMessage.messageKey &&
              t(progressMessage.messageKey, progressMessage.messageParams)}
          </p>
        </div>
      )}

      {chipHistories && chipHistories.traces.length > 0 && (
        <section className="chart-section">
          <ChartCaption lines={chipHistories.caption} />
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
          <ChartCaption lines={handUsage.caption} />
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
          <ChartCaption lines={allInEquity.caption} />
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
