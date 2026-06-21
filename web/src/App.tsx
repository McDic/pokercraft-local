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
  ConfirmModal,
  ErrorBoundary,
} from './components'

// Hooks
import { useAnalysisWorker } from './hooks/useAnalysisWorker'

// Export
import { generateExportHTML, downloadHTML, type ExportChart } from './export/htmlExport'

/** Local timestamp `YYYY-MM-DD_HH-MM-SS` for export filenames (colon-free for all OSes). */
function exportTimestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<ChartTab>('tournament')
  const [pendingExport, setPendingExport] = useState<
    { charts: ExportChart[]; isTournament: boolean } | null
  >(null)
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

  // Auto-run analysis when new tournament data is added
  // (Hand history analysis is handled independently by HandHistoryCharts)
  useEffect(() => {
    const hasTournamentChanges = tournaments.length !== prevTournamentCountRef.current

    if (hasTournamentChanges && !isLoading && tournaments.length > 0) {
      prevTournamentCountRef.current = tournaments.length
      runAnalysis()
    }
  }, [tournaments.length, isLoading, runAnalysis])

  const runExport = useCallback((charts: ExportChart[], isTournament: boolean) => {
    const html = isTournament
      ? generateExportHTML(charts, [])
      : generateExportHTML([], charts)
    const label = isTournament ? 'tournament' : 'handhistory'
    downloadHTML(html, `pokercraft-${label}-${exportTimestamp()}.html`)
  }, [])

  const handleExport = useCallback(() => {
    // Export only the currently-active tab's charts.
    const isTournament = activeTab === 'tournament'
    const activeRef = isTournament ? tournamentChartsRef.current : handHistoryChartsRef.current
    const charts = activeRef?.getChartData() ?? []
    if (charts.length === 0) return

    // Eager export: warn if charts may still be incomplete. This covers the chart
    // component's own generation loop (isComputing) plus the bankroll simulation,
    // which runs in the analysis worker (isLoading) rather than inside
    // TournamentCharts. The analysis worker only produces tournament charts, so
    // isLoading is only relevant to the tournament tab — gating it there avoids a
    // false "still calculating" warning when exporting hand history during analysis.
    if ((isTournament && isLoading) || activeRef?.isComputing()) {
      setPendingExport({ charts, isTournament })
      return
    }

    runExport(charts, isTournament)
  }, [activeTab, isLoading, runExport])

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
        <ErrorBoundary label="tournament charts" resetKeys={[tournaments, bankrollResults]}>
          <TournamentCharts
            ref={tournamentChartsRef}
            tournaments={tournaments}
            bankrollResults={bankrollResults}
          />
        </ErrorBoundary>
      </div>

      <div style={{ display: activeTab === 'handHistory' ? 'block' : 'none' }}>
        <ErrorBoundary label="hand history charts" resetKeys={[handHistories]}>
          <HandHistoryCharts ref={handHistoryChartsRef} handHistories={handHistories} />
        </ErrorBoundary>
      </div>

      <ConfirmModal
        open={pendingExport !== null}
        title="Charts still calculating"
        message="Some charts (such as All-In Equity) are still being calculated and may be missing from the export. Export anyway?"
        confirmLabel="Export anyway"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (pendingExport) runExport(pendingExport.charts, pendingExport.isTournament)
          setPendingExport(null)
        }}
        onCancel={() => setPendingExport(null)}
      />
    </div>
  )
}

export default App
