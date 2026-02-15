import { useState, useEffect, useCallback } from 'react'
import Plot from 'react-plotly.js'
import './App.css'

// WASM
import init, { simulate, version } from './wasm/pokercraft_wasm'

// Parser
import { loadAndParseFiles, CurrencyRateConverter } from './parser'
import type { TournamentSummary } from './types'

// Visualization
import {
  getHistoricalPerformanceData,
  getRREHeatmapData,
  getPrizePiesData,
  getRRByRankData,
  collectRelativeReturns,
  getBankrollAnalysisData,
  type BankrollResult,
} from './visualization'

function App() {
  const [wasmReady, setWasmReady] = useState(false)
  const [wasmVersion, setWasmVersion] = useState('')
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Initialize WASM
  useEffect(() => {
    init().then(() => {
      setWasmReady(true)
      setWasmVersion(version())
    })
  }, [])

  // File handling
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setLoading(true)
    setErrors([])

    try {
      const rateConverter = new CurrencyRateConverter()
      const result = await loadAndParseFiles(files, rateConverter, false)

      // Sort tournaments by start time
      const sorted = [...result.tournaments].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime()
      )

      setTournaments(sorted)
      setErrors(result.errors)
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files)
      }
    },
    [handleFiles]
  )

  // Run bankroll simulation
  const runBankrollAnalysis = useCallback((): BankrollResult[] => {
    if (!wasmReady || tournaments.length === 0) return []

    const relativeReturns = collectRelativeReturns(tournaments)
    if (relativeReturns.length === 0) return []

    const initialCapitals = [10, 20, 50, 100, 200, 500]
    const maxIterations = Math.max(40000, tournaments.length * 10)
    const results: BankrollResult[] = []

    for (const initialCapital of initialCapitals) {
      try {
        const result = simulate(
          initialCapital,
          new Float64Array(relativeReturns),
          maxIterations,
          0.0,
          25000
        )
        results.push({
          initialCapital,
          bankruptcyRate: result.bankruptcyRate,
          survivalRate: result.survivalRate,
        })
        result.free()
      } catch {
        // Simulation failed for this capital level
      }
    }

    return results
  }, [wasmReady, tournaments])

  if (!wasmReady) {
    return <div className="loading">Loading WASM module...</div>
  }

  // Generate chart data
  const historicalData = tournaments.length > 0 ? getHistoricalPerformanceData(tournaments) : null
  const rreData = tournaments.length > 0 ? getRREHeatmapData(tournaments) : null
  const prizePiesData = tournaments.length > 0 ? getPrizePiesData(tournaments) : null
  const rrByRankData = tournaments.length > 0 ? getRRByRankData(tournaments) : null
  const bankrollResults = runBankrollAnalysis()
  const bankrollData = bankrollResults.length > 0 ? getBankrollAnalysisData(bankrollResults) : null

  return (
    <div className="app">
      <header className="header">
        <h1>Pokercraft Local - Web</h1>
        <p className="version">WASM v{wasmVersion}</p>
      </header>

      {/* File Upload */}
      <section
        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <p>Drag & drop tournament files here (.txt or .zip)</p>
        <p>or</p>
        <input
          type="file"
          multiple
          accept=".txt,.zip"
          onChange={handleFileInput}
          id="file-input"
        />
        <label htmlFor="file-input" className="file-label">
          Choose Files
        </label>
      </section>

      {loading && <div className="loading">Parsing files...</div>}

      {errors.length > 0 && (
        <div className="errors">
          <h3>Errors:</h3>
          <ul>
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {tournaments.length > 0 && (
        <div className="stats">
          <p>Loaded {tournaments.length} tournaments</p>
        </div>
      )}

      {/* Charts */}
      {historicalData && (
        <section className="chart-section">
          <Plot
            data={historicalData.traces}
            layout={{ ...historicalData.layout, autosize: true }}
            useResizeHandler
            style={{ width: '100%', height: '800px' }}
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
          />
        </section>
      )}
    </div>
  )
}

export default App
