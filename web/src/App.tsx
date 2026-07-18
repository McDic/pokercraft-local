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
  DeepDiveCharts,
  ConfirmModal,
  ErrorBoundary,
} from './components'

// Hooks
import { useAnalysisWorker } from './hooks/useAnalysisWorker'

// Export
import { generateExportHTML, downloadHTML, type ExportChart } from './export/htmlExport'
import type { SituationExport } from './export/situationPayload'
import type { TranslationKey } from './i18n'

/** Local timestamp `YYYY-MM-DD_HH-MM-SS` for export filenames (colon-free for all OSes). */
function exportTimestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  )
}

/**
 * How each tab exports: its heading, its div-id prefix, and the word in the filename.
 *
 * One table rather than three ternaries, because the previous shape — "tournament, or else
 * hand history" — silently mislabelled the situation tab's export the moment a third tab
 * existed: right charts, wrong filename, wrong heading.
 */
const EXPORT_BY_TAB: Record<
  ChartTab,
  { titleKey: TranslationKey; prefix: string; filename: string }
> = {
  tournament: {
    titleKey: 'export.section.tournament',
    prefix: 'tournament',
    filename: 'tournament',
  },
  handHistory: {
    titleKey: 'export.section.handHistory',
    prefix: 'hand',
    filename: 'handhistory',
  },
  situation: {
    titleKey: 'export.section.situation',
    prefix: 'situation',
    // Matches what the tab and the export heading both call it ("Preflop Situations").
    // `prefix` is a DOM id and need not, but a filename is read by a person.
    filename: 'preflop-situations',
  },
  // The Deep Dive tab renders a table, not figures, so it has no export in v1 (its export
  // affordance is disabled while it is active). This entry only satisfies the exhaustive
  // Record<ChartTab, …> type; it is never read at runtime.
  deepDive: {
    titleKey: 'export.section.deepDive',
    prefix: 'deepdive',
    filename: 'deep-dive',
  },
}

/**
 * What one tab exports.
 *
 * Two shapes, not one: the tournament and hand-history tabs export *figures*, while the
 * situation tab exports the decisions behind them plus a runtime, so its filter dropdowns keep
 * working in the downloaded file. See `export/situationPayload.ts`.
 */
interface ExportRequest {
  tab: ChartTab
  charts: ExportChart[]
  situation?: SituationExport
}

function App() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<ChartTab>('tournament')
  const [pendingExport, setPendingExport] = useState<ExportRequest | null>(null)
  const tournamentChartsRef = useRef<TournamentChartsRef>(null)
  const handHistoryChartsRef = useRef<HandHistoryChartsRef>(null)
  const situationChartsRef = useRef<SituationChartsRef>(null)

  const {
    isLoading,
    isParsing,
    isAnalyzing,
    parseProgress,
    analyzeProgress,
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
    ({ tab, charts, situation }: ExportRequest) => {
      const { titleKey, prefix, filename } = EXPORT_BY_TAB[tab]
      const html = generateExportHTML([{ titleKey, prefix, charts, situation }], t, language)
      downloadHTML(html, `pokercraft-${filename}-${exportTimestamp()}.html`)
    },
    [t, language]
  )

  const handleExport = useCallback(() => {
    // Export only the currently-active tab.
    const isTournament = activeTab === 'tournament'
    const activeRef = isTournament
      ? tournamentChartsRef.current
      : activeTab === 'handHistory'
        ? handHistoryChartsRef.current
        : situationChartsRef.current

    // The situation tab exports its data and a runtime rather than figures, so that its
    // filters keep working offline. Everything else exports the figures it is showing.
    const request: ExportRequest =
      activeTab === 'situation'
        ? {
            tab: activeTab,
            charts: [],
            situation: situationChartsRef.current?.getExportPayload() ?? undefined,
          }
        : {
            tab: activeTab,
            charts:
              (isTournament ? tournamentChartsRef.current : handHistoryChartsRef.current)
                ?.getChartData() ?? [],
          }

    if (request.charts.length === 0 && request.situation === undefined) return

    // Eager export: warn if charts may still be incomplete. This covers the chart
    // component's own generation loop (isComputing) plus the bankroll simulation,
    // which runs in the analysis worker (isLoading) rather than inside
    // TournamentCharts. The analysis worker only produces tournament charts, so
    // isLoading is only relevant to the tournament tab — gating it there avoids a
    // false "still calculating" warning when exporting hand history during analysis.
    if ((isTournament && isLoading) || activeRef?.isComputing()) {
      setPendingExport(request)
      return
    }

    runExport(request)
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
        onExport={
          // The Deep Dive tab has no export in v1 (it shows a table, not figures), so the
          // export affordance is disabled while it is active.
          activeTab !== 'deepDive' && (tournaments.length > 0 || handHistories.length > 0)
            ? handleExport
            : undefined
        }
      />

      <FileUploader
        onFilesSelected={parseFiles}
        isParsing={isParsing}
        parseProgress={parseProgress}
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
            isAnalyzing={isAnalyzing}
            analyzeProgress={analyzeProgress}
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

      <div style={{ display: activeTab === 'deepDive' ? 'block' : 'none' }}>
        <ErrorBoundary
          labelKey="errorBoundary.label.deepDiveCharts"
          resetKeys={[tournaments, handHistories]}
        >
          <DeepDiveCharts tournaments={tournaments} handHistories={handHistories} />
        </ErrorBoundary>
      </div>

      <ConfirmModal
        open={pendingExport !== null}
        title={t('modal.export.title')}
        message={t('modal.export.message')}
        confirmLabel={t('modal.export.confirm')}
        cancelLabel={t('modal.cancel')}
        onConfirm={() => {
          if (pendingExport) runExport(pendingExport)
          setPendingExport(null)
        }}
        onCancel={() => setPendingExport(null)}
      />
    </div>
  )
}

export default App
