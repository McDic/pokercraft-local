/**
 * File uploader component with drag & drop and progress indicator
 */

import { useCallback, useState } from 'react'
import type { AnalysisProgress } from '../hooks/useAnalysisWorker'

interface FileUploaderProps {
  onFilesSelected: (files: FileList | File[]) => void
  isLoading: boolean
  progress: AnalysisProgress | null
  handHistoryCount: number
}

export function FileUploader({
  onFilesSelected,
  isLoading,
  progress,
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
        e.target.value = ''
      }
    },
    [onFilesSelected, isLoading]
  )

  const showStatsBar = handHistoryCount > 0

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
              Drop Pokercraft exports here
            </p>
            <p className="upload-secondary">
              Supports .txt and .zip files from GG Poker and Pokercraft
            </p>
            <label className={`file-button ${isLoading ? 'is-disabled' : ''}`}>
              <span>Import Files</span>
              <input
                className="file-input-overlay"
                type="file"
                multiple
                accept=".txt,.zip"
                onChange={handleFileInput}
                disabled={isLoading}
              />
            </label>
          </>
        )}
      </div>

      {showStatsBar && !isLoading && (
        <div className="stats-bar">
          <span className="stat">
            <strong>{handHistoryCount}</strong> hand histories
          </span>
        </div>
      )}
    </section>
  )
}
