import { useState, useEffect, useRef } from 'react'
import './App.css'

// Components
import {
  Header,
  FileUploader,
  ChartTabs,
  type ChartTab,
  TournamentCharts,
  HandHistoryCharts,
} from './components'

// Hooks
import { useAnalysisWorker } from './hooks/useAnalysisWorker'

function App() {
  const [activeTab, setActiveTab] = useState<ChartTab>('tournament')
  const [wasmVersion, setWasmVersion] = useState('')
  const prevTournamentCountRef = useRef(0)
  const prevHandHistoryCountRef = useRef(0)

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

  // Auto-run analysis when new unique data is added
  useEffect(() => {
    const hasTournamentChanges = tournaments.length !== prevTournamentCountRef.current
    const hasHandHistoryChanges = handHistories.length !== prevHandHistoryCountRef.current

    if ((hasTournamentChanges || hasHandHistoryChanges) && !isLoading) {
      prevTournamentCountRef.current = tournaments.length
      prevHandHistoryCountRef.current = handHistories.length
      runAnalysis()
    }
  }, [tournaments.length, handHistories.length, isLoading, runAnalysis])

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
      <Header wasmVersion={wasmVersion} />

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

      <div style={{ display: activeTab === 'tournament' ? 'block' : 'none' }}>
        <TournamentCharts
          tournaments={tournaments}
          bankrollResults={bankrollResults}
        />
      </div>

      <div style={{ display: activeTab === 'handHistory' ? 'block' : 'none' }}>
        <HandHistoryCharts handHistories={handHistories} />
      </div>
    </div>
  )
}

export default App
