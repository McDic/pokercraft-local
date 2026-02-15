/**
 * Web Worker for equity calculations
 * Runs WASM completely off the main thread
 */

import init, { EquityResult, LuckCalculator } from '../wasm/pokercraft_wasm'

export interface EquityWorkerInput {
  type: 'calculate'
  hands: {
    handId: string
    tournamentId: number | null
    allInStreet: string
    heroCards: [string, string]
    opponents: string[][]
    communityAtAllIn: string[]
    actualResult: number
  }[]
}

export interface EquityWorkerProgress {
  type: 'progress'
  current: number
  total: number
}

export interface EquityWorkerResult {
  type: 'result'
  data: {
    handId: string
    tournamentId: number | null
    allInStreet: string
    equity: number
    actualResult: number
    communityAtAllIn: string[]
  }[]
  luckScore: number
}

export interface EquityWorkerError {
  type: 'error'
  message: string
}

export type EquityWorkerOutput = EquityWorkerProgress | EquityWorkerResult | EquityWorkerError

let wasmInitialized = false

async function ensureWasmInit(): Promise<void> {
  if (!wasmInitialized) {
    await init()
    wasmInitialized = true
  }
}

self.onmessage = async (event: MessageEvent<EquityWorkerInput>) => {
  const { type, hands } = event.data

  if (type !== 'calculate') return

  try {
    await ensureWasmInit()

    const results: EquityWorkerResult['data'] = []
    const luckCalc = new LuckCalculator()

    for (let i = 0; i < hands.length; i++) {
      const h = hands[i]

      try {
        const allHands = [h.heroCards, ...h.opponents]
        const equityResult = new EquityResult(allHands, h.communityAtAllIn)
        const equity = equityResult.getEquity(0)
        equityResult.free()

        results.push({
          handId: h.handId,
          tournamentId: h.tournamentId,
          allInStreet: h.allInStreet,
          equity,
          actualResult: h.actualResult,
          communityAtAllIn: h.communityAtAllIn,
        })

        try {
          luckCalc.addResult(equity, h.actualResult)
        } catch {
          // Skip invalid luck results
        }
      } catch {
        // Skip failed equity calculations
      }

      // Post progress every 5 hands
      if ((i + 1) % 5 === 0 || i === hands.length - 1) {
        self.postMessage({
          type: 'progress',
          current: i + 1,
          total: hands.length,
        } as EquityWorkerProgress)
      }
    }

    let luckScore = 0
    try {
      luckScore = luckCalc.luckScore()
    } catch {
      // Luck calculation failed
    }
    luckCalc.free()

    self.postMessage({
      type: 'result',
      data: results,
      luckScore,
    } as EquityWorkerResult)
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } as EquityWorkerError)
  }
}
