import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  SituationCharts,
  type SituationChartsRef,
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
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<ChartTab>('tournament')
  const [pendingExport, setPendingExport] = useState<
    { charts: ExportChart[]; isTournament: boolean } | null
  >(null)
  const tournamentChartsRef = useRef<TournamentChartsRef>(null)
  const handHistoryChartsRef = useRef<HandHistoryChartsRef>(null)
  const situationChartsRef = useRef<SituationChartsRef>(null)

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

  // Auto-run analysis whenever the tournament set actually changes. `tournaments`
  // keeps its identity when a parse adds nothing new, so this fires exactly once
  // per real data change.
  // (Hand history analysis is handled independently by HandHistoryCharts)
  useEffect(() => {
    if (tournaments.length > 0) {
      runAnalysis()
    }
  }, [tournaments, runAnalysis])

  // The export follows whatever language the site is currently in: the charts were
  // built in it, so anything else would mean rebuilding every figure.
  const language = i18n.resolvedLanguage ?? 'en'
  const runExport = useCallback(
    (charts: ExportChart[], isTournament: boolean) => {
      const html = isTournament
        ? generateExportHTML(charts, [], t, language)
        : generateExportHTML([], charts, t, language)
      const label = isTournament ? 'tournament' : 'handhistory'
      downloadHTML(html, `pokercraft-${label}-${exportTimestamp()}.html`)
    },
    [t, language]
  )

  const handleExport = useCallback(() => {
    // Export only the currently-active tab's charts. Situations are derived from the hand
    // histories, so they export under the hand-history heading — but they have their own
    // ref, and picking it by "not tournament" would quietly export the wrong tab's charts.
    const isTournament = activeTab === 'tournament'
    const activeRef = isTournament
      ? tournamentChartsRef.current
      : activeTab === 'handHistory'
        ? handHistoryChartsRef.current
        : situationChartsRef.current
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
          <h3>{t('errors.title')}</h3>
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
        <ErrorBoundary
          labelKey="errorBoundary.label.tournamentCharts"
          resetKeys={[tournaments, bankrollResults]}
        >
          <TournamentCharts
            ref={tournamentChartsRef}
            tournaments={tournaments}
            bankrollResults={bankrollResults}
          />
        </ErrorBoundary>
      </div>

      <div style={{ display: activeTab === 'handHistory' ? 'block' : 'none' }}>
        <ErrorBoundary labelKey="errorBoundary.label.handHistoryCharts" resetKeys={[handHistories]}>
          <HandHistoryCharts ref={handHistoryChartsRef} handHistories={handHistories} />
        </ErrorBoundary>
      </div>

      <div style={{ display: activeTab === 'situation' ? 'block' : 'none' }}>
        <ErrorBoundary labelKey="errorBoundary.label.situationCharts" resetKeys={[handHistories]}>
          <SituationCharts ref={situationChartsRef} handHistories={handHistories} />
        </ErrorBoundary>
      </div>

      <ConfirmModal
        open={pendingExport !== null}
        title={t('modal.export.title')}
        message={t('modal.export.message')}
        confirmLabel={t('modal.export.confirm')}
        cancelLabel={t('modal.cancel')}
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
