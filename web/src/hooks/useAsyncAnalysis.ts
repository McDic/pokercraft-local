/**
 * Hook for async analysis with progress tracking
 * Accumulates data across multiple file uploads and caches results
 */

import { useState, useCallback, useRef } from 'react'
import type { TournamentSummary, HandHistory } from '../types'
import { loadAndParseFiles, CurrencyRateConverter } from '../parser'
import { simulate } from '../wasm/pokercraft_wasm'
import { collectRelativeReturns, type BankrollResult } from '../visualization'
import { yieldToBrowser } from '../utils'

export interface AnalysisProgress {
  stage: 'idle' | 'parsing' | 'charts' | 'bankroll' | 'complete'
  message: string
  percentage: number
}

export interface AnalysisState {
  isLoading: boolean
  progress: AnalysisProgress
  tournaments: TournamentSummary[]
  handHistories: HandHistory[]
  bankrollResults: BankrollResult[]
  errors: string[]
}

const initialProgress: AnalysisProgress = {
  stage: 'idle',
  message: '',
  percentage: 0,
}

/**
 * Merge new items with existing, deduplicating by ID
 */
function mergeById<T extends { id: string }>(
  existing: T[],
  newItems: T[]
): T[] {
  const existingIds = new Set(existing.map(item => item.id))
  const uniqueNew = newItems.filter(item => !existingIds.has(item.id))
  return [...existing, ...uniqueNew]
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

export function useAsyncAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    isLoading: false,
    progress: initialProgress,
    tournaments: [],
    handHistories: [],
    bankrollResults: [],
    errors: [],
  })

  const abortRef = useRef(false)

  const setProgress = useCallback((stage: AnalysisProgress['stage'], message: string, percentage: number) => {
    setState(prev => ({
      ...prev,
      progress: { stage, message, percentage },
    }))
  }, [])

  const parseFiles = useCallback(async (files: FileList | File[], allowFreerolls = false) => {
    abortRef.current = false

    setState(prev => ({
      ...prev,
      isLoading: true,
      progress: { stage: 'parsing', message: 'Loading files...', percentage: 0 },
      // Don't clear errors - accumulate them
    }))

    await yieldToBrowser()

    try {
      const rateConverter = new CurrencyRateConverter()
      const result = await loadAndParseFiles(
        files,
        rateConverter,
        allowFreerolls,
        (current, total, stage) => {
          if (stage === 'loading') {
            const pct = Math.floor((current / total) * 40)
            setProgress('parsing', `Loading files: ${current}/${total}...`, pct)
          } else {
            const pct = 40 + Math.floor((current / total) * 40)
            setProgress('parsing', `Parsing files: ${current}/${total}...`, pct)
          }
        }
      )

      if (abortRef.current) return

      setProgress('parsing', 'Merging data...', 85)
      await yieldToBrowser()

      // Merge and sort with yielding between steps
      // Get current state snapshot via ref pattern
      let currentTournaments: TournamentSummary[] = []
      let currentHH: HandHistory[] = []
      setState(prev => {
        currentTournaments = prev.tournaments
        currentHH = prev.handHistories
        return prev
      })
      await yieldToBrowser()

      setProgress('parsing', 'Merging tournaments...', 87)
      const mergedTournaments = mergeTournaments(currentTournaments, result.tournaments)
      await yieldToBrowser()

      setProgress('parsing', 'Sorting tournaments...', 90)
      mergedTournaments.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      await yieldToBrowser()

      setProgress('parsing', 'Merging hand histories...', 93)
      const mergedHH = mergeById(currentHH, result.handHistories)
      await yieldToBrowser()

      setProgress('parsing', 'Sorting hand histories...', 96)
      mergedHH.sort((a, b) => a.datetime.getTime() - b.datetime.getTime())
      await yieldToBrowser()

      const newTournamentCount = mergedTournaments.length - currentTournaments.length
      const newHHCount = mergedHH.length - currentHH.length

      // Update state with merged data
      setState(prev => ({
        ...prev,
        tournaments: mergedTournaments,
        handHistories: mergedHH,
        errors: [...prev.errors, ...result.errors],
        progress: {
          stage: 'parsing',
          message: `Added ${newTournamentCount} tournaments, ${newHHCount} hand histories`,
          percentage: 100,
        },
      }))

      await yieldToBrowser()

      // Run bankroll simulation with ALL tournaments
      setState(prev => {
        if (prev.tournaments.length > 0) {
          // Trigger bankroll simulation
          runBankrollSimulationAsync(prev.tournaments, setProgress, abortRef, setState)
        }
        return prev
      })

    } catch (error) {
      setState(prev => ({
        ...prev,
        errors: [...prev.errors, error instanceof Error ? error.message : String(error)],
      }))
    } finally {
      setState(prev => ({
        ...prev,
        isLoading: false,
      }))
    }
  }, [setProgress])

  const reset = useCallback(() => {
    abortRef.current = true
    setState({
      isLoading: false,
      progress: initialProgress,
      tournaments: [],
      handHistories: [],
      bankrollResults: [],
      errors: [],
    })
  }, [])

  return {
    ...state,
    parseFiles,
    reset,
  }
}

async function runBankrollSimulationAsync(
  tournaments: TournamentSummary[],
  setProgress: (stage: AnalysisProgress['stage'], message: string, percentage: number) => void,
  abortRef: React.MutableRefObject<boolean>,
  setState: React.Dispatch<React.SetStateAction<AnalysisState>>
): Promise<void> {
  setProgress('bankroll', 'Running bankroll simulation...', 0)

  const relativeReturns = collectRelativeReturns(tournaments)
  if (relativeReturns.length === 0) {
    setProgress('complete', 'Analysis complete', 100)
    return
  }

  const initialCapitals = [10, 20, 50, 100, 200, 500]
  const maxIterations = Math.max(40000, tournaments.length * 10)
  const results: BankrollResult[] = []

  for (let i = 0; i < initialCapitals.length; i++) {
    if (abortRef.current) break

    const initialCapital = initialCapitals[i]
    setProgress('bankroll', `Simulating ${initialCapital} buy-ins...`, ((i + 1) / initialCapitals.length) * 100)

    await yieldToBrowser()

    try {
      const result = simulate(
        initialCapital,
        new Float64Array(relativeReturns),
        maxIterations,
        0.0,
        25000
      )
      results.push({
        initialCapital,
        bankruptcyRate: result.bankruptcyRate,
        survivalRate: result.survivalRate,
      })
      result.free()
    } catch {
      // Simulation failed for this capital level
    }
  }

  if (!abortRef.current) {
    setState(prev => ({
      ...prev,
      bankrollResults: results,
    }))
    setProgress('complete', 'Analysis complete', 100)
  }
}
