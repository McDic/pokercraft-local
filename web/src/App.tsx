import './App.css'

// Components
import {
  Header,
  FileUploader,
  TournamentSummaryDashboard,
} from './components'

// Hooks
import { useAnalysisWorker } from './hooks/useAnalysisWorker'

function App() {
  const {
    isLoading,
    progress,
    tournaments,
    handHistories,
    errors,
    parseFiles,
  } = useAnalysisWorker()

  const showFileUploader = isLoading || tournaments.length === 0

  return (
    <div className="app">
      <Header />

      {showFileUploader && (
        <FileUploader
          onFilesSelected={parseFiles}
          isLoading={isLoading}
          progress={progress}
          handHistoryCount={handHistories.length}
        />
      )}

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

      <TournamentSummaryDashboard
        tournaments={tournaments}
        handHistoryCount={handHistories.length}
      />
    </div>
  )
}

export default App
