import { useState, useEffect } from 'react'
import './App.css'

// WASM
import init, { version } from './wasm/pokercraft_wasm'

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
import { useAsyncAnalysis } from './hooks/useAsyncAnalysis'

function App() {
  const [wasmReady, setWasmReady] = useState(false)
  const [wasmVersion, setWasmVersion] = useState('')
  const [activeTab, setActiveTab] = useState<ChartTab>('tournament')

  const {
    isLoading,
    progress,
    tournaments,
    handHistories,
    bankrollResults,
    errors,
    parseFiles,
  } = useAsyncAnalysis()

  // Initialize WASM
  useEffect(() => {
    init().then(() => {
      setWasmReady(true)
      setWasmVersion(version())
    })
  }, [])

  // Auto-switch tab when data changes
  useEffect(() => {
    if (tournaments.length === 0 && handHistories.length > 0) {
      setActiveTab('handHistory')
    } else if (tournaments.length > 0 && handHistories.length === 0) {
      setActiveTab('tournament')
    }
  }, [tournaments.length, handHistories.length])

  if (!wasmReady) {
    return (
      <div className="app">
        <div className="loading-screen">
          Loading WASM module...
        </div>
      </div>
    )
  }

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

      {activeTab === 'tournament' && (
        <TournamentCharts
          tournaments={tournaments}
          bankrollResults={bankrollResults}
        />
      )}

      {activeTab === 'handHistory' && (
        <HandHistoryCharts handHistories={handHistories} />
      )}
    </div>
  )
}

export default App
