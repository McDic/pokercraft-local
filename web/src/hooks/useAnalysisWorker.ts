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

export interface AnalysisProgress {
  stage: WorkerProgress['stage']
  current: number
  total: number
  message: string
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
 * Merge tournaments, deduplicating by tournament ID
 */
function mergeTournaments(
  existing: TournamentSummary[],
  newItems: TournamentSummary[]
): TournamentSummary[] {
  const existingIds = new Set(existing.map(t => t.id))
  const uniqueNew = newItems.filter(t => !existingIds.has(t.id))
  return [...existing, ...uniqueNew]
}

/**
 * Merge hand histories, deduplicating by hand ID
 */
function mergeHandHistories(
  existing: HandHistory[],
  newItems: HandHistory[]
): HandHistory[] {
  const existingIds = new Set(existing.map(h => h.id))
  const uniqueNew = newItems.filter(h => !existingIds.has(h.id))
  return [...existing, ...uniqueNew]
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
            message: progress.message,
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
            const mergedTournaments = mergeTournaments(prev.tournaments, result.parseResult!.tournaments)
            const mergedHH = mergeHandHistories(prev.handHistories, result.parseResult!.handHistories)

            // Sort by time
            mergedTournaments.sort(
              (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
            )
            mergedHH.sort(
              (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
            )

            return {
              ...prev,
              isLoading: false,
              progress: null,
              tournaments: mergedTournaments,
              handHistories: mergedHH,
              errors: [...prev.errors, ...result.parseResult!.errors],
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
        errors: [...prev.errors, `Worker error: ${error.message}`],
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
        message: 'Starting...',
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

  const runAnalysis = useCallback(() => {
    if (!workerRef.current) return
    if (state.tournaments.length === 0 && state.handHistories.length === 0) return

    setState(prev => ({
      ...prev,
      isLoading: true,
      progress: {
        stage: 'init',
        current: 0,
        total: 1,
        message: 'Starting analysis...',
        percentage: 0,
      },
    }))

    workerRef.current.postMessage({
      type: 'analyze',
      tournaments: state.tournaments,
      handHistories: state.handHistories,
    } as WorkerMessage)
  }, [state.tournaments, state.handHistories])

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
