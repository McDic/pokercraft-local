/**
 * React hook for managing the analysis Web Workers.
 *
 * Two workers, so parsing and the bankroll simulation run independently: after tournament results
 * are uploaded the bankroll sim runs on the analyze worker, and hand histories dropped in during it
 * are parsed on the parse worker at the same time (each worker has its own WASM instance) — the
 * hand-history charts and all-in equity then start without waiting for the sim to finish. Within a
 * worker, tasks that arrive while it is busy queue and post when it frees.
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
  /** Files are being read/parsed. The uploader blocks during this (short) phase. */
  isParsing: boolean
  /** The bankroll simulation is running. Runs on its own worker, so the uploader stays usable. */
  isAnalyzing: boolean
  /** Progress of the current parse — shown in the uploader. */
  parseProgress: AnalysisProgress | null
  /** Progress of the bankroll sim — shown in the tournament tab, like equity in the HH tab. */
  analyzeProgress: AnalysisProgress | null
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
  /** Derived: any worker task in flight (parse or analyze). Kept for consumers that mean "busy". */
  isLoading: boolean
  parseFiles: (files: FileList | File[], allowFreerolls?: boolean) => void
  runAnalysis: () => void
  reset: () => void
}

const initialState: AnalysisState = {
  isParsing: false,
  isAnalyzing: false,
  parseProgress: null,
  analyzeProgress: null,
  tournaments: [],
  handHistories: [],
  equityData: [],
  bankrollResults: [],
  errors: [],
  wasmVersion: '',
}

const STARTING_PROGRESS = (messageKey: TranslationKey): AnalysisProgress => ({
  stage: 'init',
  current: 0,
  total: 1,
  messageKey,
  percentage: 0,
})

function toProgress(p: WorkerProgress): AnalysisProgress {
  return {
    stage: p.stage,
    current: p.current,
    total: p.total,
    messageKey: p.messageKey,
    messageParams: p.messageParams,
    percentage: p.total > 0 ? (p.current / p.total) * 100 : 0,
  }
}

function newWorker(): Worker {
  return new Worker(new URL('../workers/analysisWorker.ts', import.meta.url), { type: 'module' })
}

export function useAnalysisWorker(): UseAnalysisWorkerReturn {
  const [state, setState] = useState<AnalysisState>(initialState)

  // Two independent workers. Each serializes its own tasks; the two run concurrently.
  const parseWorkerRef = useRef<Worker | null>(null)
  const analyzeWorkerRef = useRef<Worker | null>(null)

  // Parse worker: files that arrive mid-parse queue here and post when it frees.
  const parseBusyRef = useRef(false)
  const pendingFilesRef = useRef<File[]>([])
  const pendingAllowFreerollsRef = useRef(false)
  const pumpParseRef = useRef<() => void>(() => {})

  // Analyze worker: a re-analyze requested mid-run is collapsed to one pending flag and re-run
  // with the latest tournaments when the current sim finishes.
  const analyzeBusyRef = useRef(false)
  const reanalyzePendingRef = useRef(false)
  const tournamentsRef = useRef<TournamentSummary[]>([])
  const pumpAnalyzeRef = useRef<() => void>(() => {})

  // The set a queued analyze posts — kept current with the merged state.
  useEffect(() => {
    tournamentsRef.current = state.tournaments
  }, [state.tournaments])

  // Reassigned each render, but closes over only refs/setState, so the once-bound worker callbacks
  // can call the latest through the ref.
  pumpParseRef.current = () => {
    const worker = parseWorkerRef.current
    if (!worker || parseBusyRef.current || pendingFilesRef.current.length === 0) return
    const files = pendingFilesRef.current
    const allowFreerolls = pendingAllowFreerollsRef.current
    pendingFilesRef.current = []
    parseBusyRef.current = true
    setState(prev => ({
      ...prev,
      isParsing: true,
      parseProgress: STARTING_PROGRESS('progress.starting'),
      errors: [],
    }))
    worker.postMessage({ type: 'parse', files, allowFreerolls } as WorkerMessage)
  }

  pumpAnalyzeRef.current = () => {
    const worker = analyzeWorkerRef.current
    if (!worker || analyzeBusyRef.current || !reanalyzePendingRef.current) return
    reanalyzePendingRef.current = false
    if (tournamentsRef.current.length === 0) return
    analyzeBusyRef.current = true
    setState(prev => ({
      ...prev,
      isAnalyzing: true,
      analyzeProgress: STARTING_PROGRESS('progress.startingAnalysis'),
    }))
    worker.postMessage({ type: 'analyze', tournaments: tournamentsRef.current } as WorkerMessage)
  }

  useEffect(() => {
    const parseWorker = newWorker()
    const analyzeWorker = newWorker()
    parseWorkerRef.current = parseWorker
    analyzeWorkerRef.current = analyzeWorker

    parseWorker.onmessage = (event: MessageEvent<WorkerProgress | WorkerResult>) => {
      const data = event.data
      if (data.type === 'progress') {
        setState(prev => ({ ...prev, parseProgress: toProgress(data as WorkerProgress) }))
      } else if (data.type === 'result') {
        const result = data as WorkerResult
        parseBusyRef.current = false
        if (result.error) {
          setState(prev => ({
            ...prev,
            isParsing: false,
            parseProgress: null,
            errors: [...prev.errors, result.error!],
          }))
        } else if (result.parseResult) {
          setState(prev => {
            const parsed = result.parseResult!
            return {
              ...prev,
              isParsing: false,
              parseProgress: null,
              tournaments: mergeTournaments(prev.tournaments, parsed.tournaments),
              handHistories: mergeHandHistories(prev.handHistories, parsed.handHistories),
              errors: [...prev.errors, ...parsed.errors],
              wasmVersion: result.wasmVersion || prev.wasmVersion,
            }
          })
        }
        pumpParseRef.current() // next queued parse, if any
      }
    }

    parseWorker.onerror = error => {
      parseBusyRef.current = false
      setState(prev => ({
        ...prev,
        isParsing: false,
        parseProgress: null,
        errors: [...prev.errors, i18n.t('errors.worker', { message: error.message })],
      }))
      pumpParseRef.current()
    }

    analyzeWorker.onmessage = (event: MessageEvent<WorkerProgress | WorkerResult>) => {
      const data = event.data
      if (data.type === 'progress') {
        setState(prev => ({ ...prev, analyzeProgress: toProgress(data as WorkerProgress) }))
      } else if (data.type === 'result') {
        const result = data as WorkerResult
        analyzeBusyRef.current = false
        if (result.error) {
          setState(prev => ({
            ...prev,
            isAnalyzing: false,
            analyzeProgress: null,
            errors: [...prev.errors, result.error!],
          }))
        } else {
          setState(prev => ({
            ...prev,
            isAnalyzing: false,
            analyzeProgress: null,
            equityData: result.equityData || prev.equityData,
            bankrollResults: result.bankrollResults || prev.bankrollResults,
          }))
        }
        pumpAnalyzeRef.current() // re-run if the set changed mid-sim
      }
    }

    analyzeWorker.onerror = error => {
      analyzeBusyRef.current = false
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        analyzeProgress: null,
        errors: [...prev.errors, i18n.t('errors.worker', { message: error.message })],
      }))
      pumpAnalyzeRef.current()
    }

    // Flush anything queued before the workers existed.
    pumpParseRef.current()
    pumpAnalyzeRef.current()

    return () => {
      parseWorker.terminate()
      analyzeWorker.terminate()
      // Reset coordination refs so a real mid-work remount can't leave a pump wedged against a
      // terminated worker. (StrictMode's init-time remount has nothing in flight, so this is
      // insurance rather than a fix for a live bug.)
      parseBusyRef.current = false
      analyzeBusyRef.current = false
      pendingFilesRef.current = []
      reanalyzePendingRef.current = false
    }
  }, [])

  const parseFiles = useCallback((files: FileList | File[], allowFreerolls = false) => {
    pendingFilesRef.current = [...pendingFilesRef.current, ...Array.from(files)]
    pendingAllowFreerollsRef.current = allowFreerolls
    pumpParseRef.current()
  }, [])

  // Only run bankroll simulation for tournaments.
  // Hand history equity is handled independently by HandHistoryCharts.
  const runAnalysis = useCallback(() => {
    reanalyzePendingRef.current = true
    pumpAnalyzeRef.current()
  }, [])

  const reset = useCallback(() => {
    parseBusyRef.current = false
    analyzeBusyRef.current = false
    pendingFilesRef.current = []
    reanalyzePendingRef.current = false
    setState(initialState)
  }, [])

  return {
    ...state,
    isLoading: state.isParsing || state.isAnalyzing,
    parseFiles,
    runAnalysis,
    reset,
  }
}
