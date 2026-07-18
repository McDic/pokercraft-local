/**
 * File uploader component with drag & drop and a parse-progress indicator.
 *
 * Only *parsing* blocks the drop zone (a second parse must not race the first). The bankroll
 * simulation runs on its own worker, so during it the drop zone stays open and you can add hand
 * histories right away — the sim's own progress shows in the tournament tab, next to the charts.
 */

import { useCallback, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { AnalysisProgress } from '../hooks/useAnalysisWorker'

interface FileUploaderProps {
  onFilesSelected: (files: FileList | File[]) => void
  isParsing: boolean
  parseProgress: AnalysisProgress | null
  tournamentCount: number
  handHistoryCount: number
}

export function FileUploader({
  onFilesSelected,
  isParsing,
  parseProgress,
  tournamentCount,
  handHistoryCount,
}: FileUploaderProps) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length > 0 && !isParsing) {
        onFilesSelected(e.dataTransfer.files)
      }
    },
    [onFilesSelected, isParsing]
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
      if (e.target.files && e.target.files.length > 0 && !isParsing) {
        onFilesSelected(e.target.files)
      }
    },
    [onFilesSelected, isParsing]
  )

  const hasData = tournamentCount > 0 || handHistoryCount > 0

  return (
    <section className="file-uploader">
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${isParsing ? 'loading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isParsing ? (
          <div className="progress-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${parseProgress?.percentage ?? 0}%` }}
              />
            </div>
            <p className="progress-message">
              {parseProgress
                ? t(parseProgress.messageKey, parseProgress.messageParams)
                : t('uploader.loading')}
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
            />
            <label htmlFor="file-input" className="file-button">
              {t('uploader.chooseFiles')}
            </label>
          </>
        )}
      </div>

      {hasData && !isParsing && (
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
