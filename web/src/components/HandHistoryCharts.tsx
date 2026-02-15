/**
 * Hand history charts container
 */

import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { HandHistory } from '../types'
import {
  getChipHistoriesData,
  getHandUsageHeatmapsData,
  getAllInEquityData,
} from '../visualization'

interface HandHistoryChartsProps {
  handHistories: HandHistory[]
}

export function HandHistoryCharts({ handHistories }: HandHistoryChartsProps) {
  const chipHistoriesData = useMemo(
    () => handHistories.length > 0 ? getChipHistoriesData(handHistories) : null,
    [handHistories]
  )

  const handUsageData = useMemo(
    () => handHistories.length > 0 ? getHandUsageHeatmapsData(handHistories) : null,
    [handHistories]
  )

  const allInEquityData = useMemo(
    () => handHistories.length > 0 ? getAllInEquityData(handHistories) : null,
    [handHistories]
  )

  if (handHistories.length === 0) {
    return (
      <div className="no-data">
        <p>No hand history data loaded</p>
      </div>
    )
  }

  return (
    <div className="charts-container">
      {chipHistoriesData && chipHistoriesData.traces.length > 0 && (
        <section className="chart-section">
          <Plot
            data={chipHistoriesData.traces}
            layout={{ ...chipHistoriesData.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '900px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {allInEquityData && allInEquityData.traces.length > 0 && (
        <section className="chart-section">
          <Plot
            data={allInEquityData.traces}
            layout={{ ...allInEquityData.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '700px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {handUsageData && handUsageData.traces.length > 0 && (
        <section className="chart-section">
          <Plot
            data={handUsageData.traces}
            layout={{ ...handUsageData.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '900px' }}
            config={{ responsive: true }}
          />
        </section>
      )}
    </div>
  )
}
