/**
 * Web Worker for equity calculations
 * Uses preflop cache for 2-player preflop (instant)
 * Falls back to full calculation for other cases
 */

import init, { EquityResult, LuckCalculator, HUPreflopEquityCache } from '../wasm/pokercraft_wasm'

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
let preflopCache: HUPreflopEquityCache | null = null

async function ensureWasmInit(): Promise<void> {
  if (!wasmInitialized) {
    await init()
    wasmInitialized = true
  }
}

async function ensurePreflopCache(): Promise<HUPreflopEquityCache | null> {
  if (preflopCache) return preflopCache

  try {
    // Fetch the preflop cache file
    const response = await fetch('/hu_preflop_cache.txt.gz')
    if (!response.ok) {
      console.warn('Failed to load preflop cache:', response.status)
      return null
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    preflopCache = new HUPreflopEquityCache(bytes)
    console.log('Preflop cache loaded successfully')
    return preflopCache
  } catch (error) {
    console.warn('Failed to load preflop cache:', error)
    return null
  }
}

/**
 * Calculate equity for a single hand
 * Uses preflop cache for 2-player preflop, full calculation otherwise
 */
function calculateEquity(
  heroCards: [string, string],
  opponents: string[][],
  communityAtAllIn: string[],
  cache: HUPreflopEquityCache | null
): number | null {
  // Try preflop cache for 2-player preflop
  if (
    cache &&
    opponents.length === 1 &&
    communityAtAllIn.length === 0
  ) {
    try {
      const equity = cache.getEquity(
        heroCards[0],
        heroCards[1],
        opponents[0][0],
        opponents[0][1]
      )
      return equity
    } catch {
      // Fall through to full calculation
    }
  }

  // Full calculation
  try {
    const allHands = [heroCards, ...opponents]
    const equityResult = new EquityResult(allHands, communityAtAllIn)
    const equity = equityResult.getEquity(0)
    equityResult.free()
    return equity
  } catch {
    return null
  }
}

self.onmessage = async (event: MessageEvent<EquityWorkerInput>) => {
  const { type, hands } = event.data

  if (type !== 'calculate') return

  try {
    await ensureWasmInit()
    const cache = await ensurePreflopCache()

    const results: EquityWorkerResult['data'] = []
    const luckCalc = new LuckCalculator()

    for (let i = 0; i < hands.length; i++) {
      const h = hands[i]

      const equity = calculateEquity(
        h.heroCards,
        h.opponents,
        h.communityAtAllIn,
        cache
      )

      if (equity !== null) {
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
