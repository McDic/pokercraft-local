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
  stats: {
    cacheHits: number
    cacheMisses: number
    fullCalcs: number
  }
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

  // Try multiple possible paths (dev vs production, with/without base path)
  // Using .bin extension to prevent browser auto-decompression of gzip
  const possiblePaths = [
    '/pokercraft-local/hu_preflop_cache.bin',  // With base path
    '/hu_preflop_cache.bin',                    // Without base path
  ]

  for (const path of possiblePaths) {
    try {
      const cacheUrl = new URL(path, self.location.origin).href
      console.log('Trying preflop cache from:', cacheUrl)

      const response = await fetch(cacheUrl)
      if (!response.ok) {
        console.log('Not found at', path, '- trying next...')
        continue
      }

      const bytes = new Uint8Array(await response.arrayBuffer())
      console.log('Preflop cache bytes loaded:', bytes.length)

      preflopCache = new HUPreflopEquityCache(bytes)
      console.log('Preflop cache initialized successfully from:', path)
      return preflopCache
    } catch (error) {
      console.log('Failed at', path, ':', error)
      continue
    }
  }

  console.warn('Failed to load preflop cache from any path')
  return null
}

// Track cache usage stats
let cacheHits = 0
let cacheMisses = 0
let fullCalcs = 0

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
      cacheHits++
      return equity
    } catch (e) {
      cacheMisses++
      console.warn('Cache lookup failed:', heroCards, 'vs', opponents[0], e)
      // Fall through to full calculation
    }
  }

  // Full calculation
  fullCalcs++
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
      stats: {
        cacheHits,
        cacheMisses,
        fullCalcs,
      },
    } as EquityWorkerResult)
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } as EquityWorkerError)
  }
}
