/**
 * Tournament summary charts container
 */

import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { TournamentSummary } from '../types'
import type { BankrollResult } from '../visualization'
import {
  getHistoricalPerformanceData,
  getRREHeatmapData,
  getPrizePiesData,
  getRRByRankData,
  getBankrollAnalysisData,
} from '../visualization'

interface TournamentChartsProps {
  tournaments: TournamentSummary[]
  bankrollResults: BankrollResult[]
}

export function TournamentCharts({ tournaments, bankrollResults }: TournamentChartsProps) {
  const historicalData = useMemo(
    () => tournaments.length > 0 ? getHistoricalPerformanceData(tournaments) : null,
    [tournaments]
  )

  const rreData = useMemo(
    () => tournaments.length > 0 ? getRREHeatmapData(tournaments) : null,
    [tournaments]
  )

  const prizePiesData = useMemo(
    () => tournaments.length > 0 ? getPrizePiesData(tournaments) : null,
    [tournaments]
  )

  const rrByRankData = useMemo(
    () => tournaments.length > 0 ? getRRByRankData(tournaments) : null,
    [tournaments]
  )

  const bankrollData = useMemo(
    () => bankrollResults.length > 0 ? getBankrollAnalysisData(bankrollResults) : null,
    [bankrollResults]
  )

  if (tournaments.length === 0) {
    return (
      <div className="no-data">
        <p>No tournament data loaded</p>
      </div>
    )
  }

  return (
    <div className="charts-container">
      {historicalData && (
        <section className="chart-section">
          <Plot
            data={historicalData.traces}
            layout={{ ...historicalData.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '800px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {rreData && (
        <section className="chart-section">
          <Plot
            data={rreData.traces}
            layout={{ ...rreData.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '500px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {bankrollData && (
        <section className="chart-section">
          <Plot
            data={bankrollData.traces}
            layout={{ ...bankrollData.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '400px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {prizePiesData && (
        <section className="chart-section">
          <Plot
            data={prizePiesData.traces}
            layout={{ ...prizePiesData.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '800px' }}
            config={{ responsive: true }}
          />
        </section>
      )}

      {rrByRankData && (
        <section className="chart-section">
          <Plot
            data={rrByRankData.traces}
            layout={{ ...rrByRankData.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '500px' }}
            config={{ responsive: true }}
          />
        </section>
      )}
    </div>
  )
}
