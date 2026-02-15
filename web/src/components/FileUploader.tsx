/**
 * File uploader component with drag & drop and progress indicator
 */

import { useCallback, useState } from 'react'
import type { AnalysisProgress } from '../hooks/useAnalysisWorker'

interface FileUploaderProps {
  onFilesSelected: (files: FileList | File[]) => void
  isLoading: boolean
  progress: AnalysisProgress | null
  tournamentCount: number
  handHistoryCount: number
}

export function FileUploader({
  onFilesSelected,
  isLoading,
  progress,
  tournamentCount,
  handHistoryCount,
}: FileUploaderProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length > 0 && !isLoading) {
        onFilesSelected(e.dataTransfer.files)
      }
    },
    [onFilesSelected, isLoading]
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
      if (e.target.files && e.target.files.length > 0 && !isLoading) {
        onFilesSelected(e.target.files)
      }
    },
    [onFilesSelected, isLoading]
  )

  const hasData = tournamentCount > 0 || handHistoryCount > 0

  return (
    <section className="file-uploader">
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${isLoading ? 'loading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isLoading ? (
          <div className="progress-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress?.percentage ?? 0}%` }}
              />
            </div>
            <p className="progress-message">{progress?.message ?? 'Loading...'}</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">📁</div>
            <p className="upload-primary">
              Drag & drop tournament files here
            </p>
            <p className="upload-secondary">
              Supports .txt and .zip files from GG Poker
            </p>
            <input
              type="file"
              multiple
              accept=".txt,.zip"
              onChange={handleFileInput}
              id="file-input"
              disabled={isLoading}
            />
            <label htmlFor="file-input" className="file-button">
              Choose Files
            </label>
          </>
        )}
      </div>

      {hasData && !isLoading && (
        <div className="stats-bar">
          <span className="stat">
            <strong>{tournamentCount}</strong> tournaments
          </span>
          {handHistoryCount > 0 && (
            <span className="stat">
              <strong>{handHistoryCount}</strong> hand histories
            </span>
          )}
        </div>
      )}
    </section>
  )
}
