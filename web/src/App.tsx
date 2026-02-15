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
  const prevDataLengthRef = useRef({ tournaments: 0, handHistories: 0 })

  const {
    isLoading,
    progress,
    tournaments,
    handHistories,
    bankrollResults,
    errors,
    wasmVersion,
    parseFiles,
    runAnalysis,
  } = useAnalysisWorker()

  // Auto-run analysis when new data is parsed
  useEffect(() => {
    const prevTournaments = prevDataLengthRef.current.tournaments
    const prevHH = prevDataLengthRef.current.handHistories

    // Check if new data was added
    if (
      (tournaments.length > prevTournaments || handHistories.length > prevHH) &&
      !isLoading
    ) {
      prevDataLengthRef.current = {
        tournaments: tournaments.length,
        handHistories: handHistories.length,
      }
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
