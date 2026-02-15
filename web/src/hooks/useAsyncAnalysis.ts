/**
 * Hook for async analysis with progress tracking
 * Uses requestAnimationFrame to keep UI responsive
 */

import { useState, useCallback, useRef } from 'react'
import type { TournamentSummary, HandHistory } from '../types'
import { loadAndParseFiles, CurrencyRateConverter } from '../parser'
import { simulate } from '../wasm/pokercraft_wasm'
import { collectRelativeReturns, type BankrollResult } from '../visualization'

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

  // Yield to browser for UI updates
  const yieldToBrowser = () => new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve())
  })

  const parseFiles = useCallback(async (files: FileList | File[], allowFreerolls = false) => {
    abortRef.current = false

    setState(prev => ({
      ...prev,
      isLoading: true,
      progress: { stage: 'parsing', message: 'Parsing files...', percentage: 0 },
      errors: [],
    }))

    await yieldToBrowser()

    try {
      const rateConverter = new CurrencyRateConverter()
      const result = await loadAndParseFiles(files, rateConverter, allowFreerolls)

      if (abortRef.current) return

      // Sort tournaments by start time
      const sortedTournaments = [...result.tournaments].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime()
      )

      // Sort hand histories by datetime
      const sortedHH = [...result.handHistories].sort(
        (a, b) => a.datetime.getTime() - b.datetime.getTime()
      )

      setProgress('parsing', 'Parsing complete', 100)
      await yieldToBrowser()

      setState(prev => ({
        ...prev,
        tournaments: sortedTournaments,
        handHistories: sortedHH,
        errors: result.errors,
      }))

      // Run bankroll simulation if we have tournaments
      if (sortedTournaments.length > 0) {
        setProgress('bankroll', 'Running bankroll simulation...', 0)
        await yieldToBrowser()

        const bankrollResults = await runBankrollSimulation(sortedTournaments, setProgress, abortRef)

        if (!abortRef.current) {
          setState(prev => ({
            ...prev,
            bankrollResults,
          }))
        }
      }

      setProgress('complete', 'Analysis complete', 100)

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

async function runBankrollSimulation(
  tournaments: TournamentSummary[],
  setProgress: (stage: AnalysisProgress['stage'], message: string, percentage: number) => void,
  abortRef: React.MutableRefObject<boolean>
): Promise<BankrollResult[]> {
  const relativeReturns = collectRelativeReturns(tournaments)
  if (relativeReturns.length === 0) return []

  const initialCapitals = [10, 20, 50, 100, 200, 500]
  const maxIterations = Math.max(40000, tournaments.length * 10)
  const results: BankrollResult[] = []

  for (let i = 0; i < initialCapitals.length; i++) {
    if (abortRef.current) break

    const initialCapital = initialCapitals[i]
    setProgress('bankroll', `Simulating ${initialCapital} buy-ins...`, ((i + 1) / initialCapitals.length) * 100)

    // Yield to browser
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

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

  return results
}
