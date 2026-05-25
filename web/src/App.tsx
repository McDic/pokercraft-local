import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

// Components
import {
  Header,
  FileUploader,
  ChartTabs,
  type ChartTab,
  TournamentCharts,
  type TournamentChartsRef,
  HandHistoryCharts,
  type HandHistoryChartsRef,
} from './components'

// Hooks
import { useAnalysisWorker } from './hooks/useAnalysisWorker'

// Export
import { generateExportHTML, downloadHTML } from './export/htmlExport'

function App() {
  const [activeTab, setActiveTab] = useState<ChartTab>('tournament')
  const [wasmVersion, setWasmVersion] = useState('')
  const prevTournamentCountRef = useRef(0)
  const tournamentChartsRef = useRef<TournamentChartsRef>(null)
  const handHistoryChartsRef = useRef<HandHistoryChartsRef>(null)

  const {
    isLoading,
    progress,
    tournaments,
    handHistories,
    bankrollResults,
    errors,
    parseFiles,
    runAnalysis,
  } = useAnalysisWorker()

  // Load WASM version on mount
  useEffect(() => {
    import('./wasm/pokercraft_wasm').then(async (wasm) => {
      await wasm.default()
      setWasmVersion(wasm.version())
    }).catch(() => {
      // WASM load failed
    })
  }, [])

  // Auto-run analysis when new tournament data is added
  // (Hand history analysis is handled independently by HandHistoryCharts)
  useEffect(() => {
    const hasTournamentChanges = tournaments.length !== prevTournamentCountRef.current

    if (hasTournamentChanges && !isLoading && tournaments.length > 0) {
      prevTournamentCountRef.current = tournaments.length
      runAnalysis()
    }
  }, [tournaments.length, isLoading, runAnalysis])

  const handleExport = useCallback(() => {
    // Export only the currently-active tab's charts.
    const isTournament = activeTab === 'tournament'
    const activeRef = isTournament ? tournamentChartsRef.current : handHistoryChartsRef.current
    const charts = activeRef?.getChartData() ?? []
    if (charts.length === 0) return

    // Eager export: warn if the active tab is still computing, since some charts
    // (e.g. the long-running All-In Equity) may be missing from the export.
    if (activeRef?.isComputing()) {
      const proceed = window.confirm(
        'Charts are still being calculated. Some charts (such as All-In Equity) may be ' +
          'missing from the export. Export anyway?'
      )
      if (!proceed) return
    }

    const html = isTournament
      ? generateExportHTML(charts, [])
      : generateExportHTML([], charts)
    const timestamp = new Date().toISOString().slice(0, 10)
    const label = isTournament ? 'tournament' : 'handhistory'
    downloadHTML(html, `pokercraft-${label}-${timestamp}.html`)
  }, [activeTab])

  // Auto-switch tab when data changes
  useEffect(() => {
    if (tournaments.length === 0 && handHistories.length > 0) {
      setActiveTab('handHistory')
    } else if (tournaments.length > 0 && handHistories.length === 0) {
      setActiveTab('tournament')
    }
  }, [tournaments.length, handHistories.length])

  return (
    <div className="app">
      <Header
        wasmVersion={wasmVersion}
        onExport={tournaments.length > 0 || handHistories.length > 0 ? handleExport : undefined}
      />

      <FileUploader
        onFilesSelected={parseFiles}
        isLoading={isLoading}
        progress={progress}
        tournamentCount={tournaments.length}
        handHistoryCount={handHistories.length}
      />

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

      <ChartTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tournamentCount={tournaments.length}
        handHistoryCount={handHistories.length}
      />

      {/* Keep both chart trees mounted (display:none) instead of conditional rendering
          to preserve computation state and progress bars across tab switches.
          Tradeoff: higher memory usage from persistent Plotly DOM nodes. */}
      <div style={{ display: activeTab === 'tournament' ? 'block' : 'none' }}>
        <TournamentCharts
          ref={tournamentChartsRef}
          tournaments={tournaments}
          bankrollResults={bankrollResults}
        />
      </div>

      <div style={{ display: activeTab === 'handHistory' ? 'block' : 'none' }}>
        <HandHistoryCharts ref={handHistoryChartsRef} handHistories={handHistories} />
      </div>
    </div>
  )
}

export default App
