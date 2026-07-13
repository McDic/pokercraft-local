/**
 * File uploader component with drag & drop and progress indicator
 */

import { useCallback, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
            <p className="progress-message">
              {progress ? t(progress.messageKey, progress.messageParams) : t('uploader.loading')}
            </p>
          </div>
        ) : (
          <>
            <div className="upload-icon">📁</div>
            <p className="upload-primary">{t('uploader.dragDrop')}</p>
            <p className="upload-secondary">{t('uploader.supports')}</p>
            <input
              type="file"
              multiple
              accept=".txt,.zip"
              onChange={handleFileInput}
              id="file-input"
              disabled={isLoading}
            />
            <label htmlFor="file-input" className="file-button">
              {t('uploader.chooseFiles')}
            </label>
          </>
        )}
      </div>

      {hasData && !isLoading && (
        <div className="stats-bar">
          {/* <Trans> rather than a plain t(): languages disagree on where the number
              goes relative to the noun ("5 tournaments" vs "토너먼트 5개"), and only
              the translation itself can decide. */}
          <span className="stat">
            <Trans
              i18nKey="uploader.stat.tournaments"
              values={{ value: tournamentCount }}
              components={{ b: <strong /> }}
            />
          </span>
          {handHistoryCount > 0 && (
            <span className="stat">
              <Trans
                i18nKey="uploader.stat.handHistories"
                values={{ value: handHistoryCount }}
                components={{ b: <strong /> }}
              />
            </span>
          )}
        </div>
      )}
    </section>
  )
}
