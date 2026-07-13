/**
 * React hook for managing the analysis Web Worker
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { TournamentSummary, HandHistory } from '../types'
import type {
  WorkerMessage,
  WorkerProgress,
  WorkerResult,
  AllInEquityWorkerData,
  BankrollWorkerResult,
} from '../workers/analysisWorker'
import i18n from '../i18n'
import type { TranslationKey } from '../i18n'

export interface AnalysisProgress {
  stage: WorkerProgress['stage']
  current: number
  total: number
  /** Rendered by the consumer with `t()`, so it follows a mid-analysis language switch. */
  messageKey: TranslationKey
  messageParams?: Record<string, string | number>
  percentage: number
}

export interface AnalysisState {
  isLoading: boolean
  progress: AnalysisProgress | null
  tournaments: TournamentSummary[]
  handHistories: HandHistory[]
  equityData: AllInEquityWorkerData[]
  bankrollResults: BankrollWorkerResult[]
  errors: string[]
  wasmVersion: string
}

/**
 * Merge tournaments, deduplicating by tournament ID and sorting by start time.
 * Returns `existing` itself when nothing new was added, so consumers can treat a
 * changed array identity as "the data really changed".
 */
export function mergeTournaments(
  existing: TournamentSummary[],
  newItems: TournamentSummary[]
): TournamentSummary[] {
  const existingIds = new Set(existing.map(t => t.id))
  const uniqueNew = newItems.filter(t => !existingIds.has(t.id))
  if (uniqueNew.length === 0) return existing
  return [...existing, ...uniqueNew].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )
}

/**
 * Merge hand histories, deduplicating by hand ID and sorting by time.
 * Preserves the existing array's identity when nothing new was added.
 */
export function mergeHandHistories(
  existing: HandHistory[],
  newItems: HandHistory[]
): HandHistory[] {
  const existingIds = new Set(existing.map(h => h.id))
  const uniqueNew = newItems.filter(h => !existingIds.has(h.id))
  if (uniqueNew.length === 0) return existing
  return [...existing, ...uniqueNew].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
  )
}

export interface UseAnalysisWorkerReturn extends AnalysisState {
  parseFiles: (files: FileList | File[], allowFreerolls?: boolean) => void
  runAnalysis: () => void
  reset: () => void
}

const initialState: AnalysisState = {
  isLoading: false,
  progress: null,
  tournaments: [],
  handHistories: [],
  equityData: [],
  bankrollResults: [],
  errors: [],
  wasmVersion: '',
}

export function useAnalysisWorker(): UseAnalysisWorkerReturn {
  const [state, setState] = useState<AnalysisState>(initialState)
  const workerRef = useRef<Worker | null>(null)

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/analysisWorker.ts', import.meta.url),
      { type: 'module' }
    )

    workerRef.current.onmessage = (event: MessageEvent<WorkerProgress | WorkerResult>) => {
      const data = event.data

      if (data.type === 'progress') {
        const progress = data as WorkerProgress
        setState(prev => ({
          ...prev,
          progress: {
            stage: progress.stage,
            current: progress.current,
            total: progress.total,
            messageKey: progress.messageKey,
            messageParams: progress.messageParams,
            percentage: progress.total > 0 ? (progress.current / progress.total) * 100 : 0,
          },
        }))
      } else if (data.type === 'result') {
        const result = data as WorkerResult

        if (result.error) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            progress: null,
            errors: [...prev.errors, result.error!],
          }))
        } else if (result.parseResult) {
          // Parse result - merge with existing data, deduplicating by ID
          setState(prev => {
            const parsed = result.parseResult!
            return {
              ...prev,
              isLoading: false,
              progress: null,
              tournaments: mergeTournaments(prev.tournaments, parsed.tournaments),
              handHistories: mergeHandHistories(prev.handHistories, parsed.handHistories),
              errors: [...prev.errors, ...parsed.errors],
              wasmVersion: result.wasmVersion || prev.wasmVersion,
            }
          })
        } else {
          // Analysis result
          setState(prev => ({
            ...prev,
            isLoading: false,
            progress: null,
            equityData: result.equityData || prev.equityData,
            bankrollResults: result.bankrollResults || prev.bankrollResults,
          }))
        }
      }
    }

    workerRef.current.onerror = (error) => {
      setState(prev => ({
        ...prev,
        isLoading: false,
        progress: null,
        errors: [...prev.errors, i18n.t('errors.worker', { message: error.message })],
      }))
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const parseFiles = useCallback((files: FileList | File[], allowFreerolls = false) => {
    if (!workerRef.current) return

    setState(prev => ({
      ...prev,
      isLoading: true,
      progress: {
        stage: 'init',
        current: 0,
        total: 1,
        messageKey: 'progress.starting',
        percentage: 0,
      },
      errors: [],
    }))

    // Convert FileList to array for worker
    const fileArray = Array.from(files)

    workerRef.current.postMessage({
      type: 'parse',
      files: fileArray,
      allowFreerolls,
    } as WorkerMessage)
  }, [])

  // Only run bankroll simulation for tournaments.
  // Hand history equity is handled independently by HandHistoryCharts.
  const runAnalysis = useCallback(() => {
    if (!workerRef.current) return
    if (state.tournaments.length === 0) return

    setState(prev => ({
      ...prev,
      isLoading: true,
      progress: {
        stage: 'init',
        current: 0,
        total: 1,
        messageKey: 'progress.startingAnalysis',
        percentage: 0,
      },
    }))

    workerRef.current.postMessage({
      type: 'analyze',
      tournaments: state.tournaments,
    } as WorkerMessage)
  }, [state.tournaments])

  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  return {
    ...state,
    parseFiles,
    runAnalysis,
    reset,
  }
}
