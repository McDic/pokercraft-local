/**
 * Hand history charts container with async loading
 */

import { useState, useEffect, useRef } from 'react'
import Plot from 'react-plotly.js'
import type { Data, Layout } from 'plotly.js-dist-min'
import type { HandHistory } from '../types'

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

async function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

export function HandHistoryCharts({ handHistories }: HandHistoryChartsProps) {
  const [state, setState] = useState<ChartsState>({
    chipHistories: null,
    allInEquity: null,
    handUsage: null,
    isComputing: false,
    progress: { message: '', percentage: 0 },
  })

  const abortRef = useRef(false)
  const computedForRef = useRef(0)

  useEffect(() => {
    if (handHistories.length === 0 || computedForRef.current === handHistories.length) {
      return
    }

    abortRef.current = false
    computedForRef.current = handHistories.length

    const compute = async () => {
      setState(prev => ({
        ...prev,
        isComputing: true,
        progress: { message: 'Loading chart modules...', percentage: 5 },
      }))

      await yieldToBrowser()

      try {
        // Dynamic import to avoid blocking
        const [
          { getChipHistoriesData, getHandUsageHeatmapsData },
          { collectAllInDataAsync, createAllInEquityChart },
        ] = await Promise.all([
          import('../visualization'),
          import('../visualization/handHistory/allInEquityAsync'),
        ])

        if (abortRef.current) return

        // Chip histories
        setState(prev => ({
          ...prev,
          progress: { message: 'Generating chip histories...', percentage: 15 },
        }))
        await yieldToBrowser()

        const chipHistories = getChipHistoriesData(handHistories)
        if (abortRef.current) return

        setState(prev => ({
          ...prev,
          chipHistories,
          progress: { message: 'Finding all-in hands...', percentage: 25 },
        }))
        await yieldToBrowser()

        // All-in equity (async with progress)
        const allInData = await collectAllInDataAsync(
          handHistories,
          (current, total) => {
            if (!abortRef.current) {
              const pct = 25 + Math.floor((current / total) * 50)
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
        if (abortRef.current) return

        const allInEquity = createAllInEquityChart(allInData)

        setState(prev => ({
          ...prev,
          allInEquity,
          progress: { message: 'Generating hand usage heatmaps...', percentage: 80 },
        }))
        await yieldToBrowser()

        // Hand usage heatmaps
        const handUsage = getHandUsageHeatmapsData(handHistories)
        if (abortRef.current) return

        setState(prev => ({
          ...prev,
          handUsage,
          isComputing: false,
          progress: { message: 'Complete', percentage: 100 },
        }))
      } catch (error) {
        console.error('Chart generation failed:', error)
        setState(prev => ({
          ...prev,
          isComputing: false,
          progress: { message: 'Error generating charts', percentage: 0 },
        }))
      }
    }

    compute()

    return () => {
      abortRef.current = true
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
    </div>
  )
}
