/**
 * Web Worker for heavy computation
 * Handles file parsing and equity calculations off the main thread
 */

import init, { EquityResult, simulate, version } from '../wasm/pokercraft_wasm'
import { loadAndParseFiles, CurrencyRateConverter } from '../parser'
import type { TournamentSummary, HandHistory, ParseResult } from '../types'
import {
  getHandHistoryAllInedStreet,
  getHandHistoryShowdownPlayers,
  getTournamentRRs,
  getTournamentBuyIn,
} from '../types'

// Message types
export interface WorkerMessage {
  type: 'parse' | 'analyze'
  files?: File[]
  tournaments?: TournamentSummary[]
  handHistories?: HandHistory[]
  allowFreerolls?: boolean
}

export interface WorkerProgress {
  type: 'progress'
  stage: 'init' | 'parsing' | 'equity' | 'bankroll' | 'complete'
  current: number
  total: number
  message: string
}

export interface WorkerResult {
  type: 'result'
  parseResult?: ParseResult
  equityData?: AllInEquityWorkerData[]
  bankrollResults?: BankrollWorkerResult[]
  wasmVersion?: string
  error?: string
}

export interface AllInEquityWorkerData {
  handId: string
  equity: number
  actualResult: number
  allInStreet: string
}

export interface BankrollWorkerResult {
  initialCapital: number
  bankruptcyRate: number
  survivalRate: number
}

let wasmInitialized = false

async function ensureWasmInit(): Promise<void> {
  if (!wasmInitialized) {
    await init()
    wasmInitialized = true
  }
}

function postProgress(stage: WorkerProgress['stage'], current: number, total: number, message: string): void {
  self.postMessage({
    type: 'progress',
    stage,
    current,
    total,
    message,
  } as WorkerProgress)
}

/**
 * Calculate actual result for a hand (1.0 = won, 0.5 = chopped 2-way, 0 = lost)
 */
function getActualResult(h: HandHistory): number {
  const heroWon = h.wons.get('Hero') ?? 0
  const showdownPlayers = getHandHistoryShowdownPlayers(h)

  if (heroWon === 0) return 0

  const winners = Array.from(h.wons.entries())
    .filter(([pid, amount]) => showdownPlayers.has(pid) && amount > 0)

  const maxWin = Math.max(...winners.map(([, amount]) => amount))
  const numWinners = winners.filter(([, amount]) => amount === maxWin).length

  if (heroWon === maxWin) {
    return 1.0 / numWinners
  }

  return 0
}

/**
 * Get community cards at a given street
 */
function getCommunityAtStreet(h: HandHistory, street: string): string[] {
  switch (street) {
    case 'preflop': return []
    case 'flop': return h.communityCards.slice(0, 3)
    case 'turn': return h.communityCards.slice(0, 4)
    case 'river': return h.communityCards.slice(0, 5)
    default: return []
  }
}

/**
 * Calculate equity data for all-in hands
 */
async function calculateEquityData(handHistories: HandHistory[]): Promise<AllInEquityWorkerData[]> {
  await ensureWasmInit()

  const results: AllInEquityWorkerData[] = []
  const eligibleHands = handHistories.filter(h => {
    const street = getHandHistoryAllInedStreet(h, 'Hero')
    if (street !== 'preflop' && street !== 'flop' && street !== 'turn') return false
    const showdown = getHandHistoryShowdownPlayers(h)
    return showdown.size >= 2 && showdown.has('Hero')
  })

  let processed = 0
  for (const h of eligibleHands) {
    const street = getHandHistoryAllInedStreet(h, 'Hero')!
    const heroCards = h.knownCards.get('Hero')
    if (!heroCards) continue

    // Get opponent cards
    const opponents: string[][] = []
    for (const playerId of getHandHistoryShowdownPlayers(h)) {
      if (playerId === 'Hero') continue
      const cards = h.knownCards.get(playerId)
      if (cards) opponents.push([cards[0], cards[1]])
    }
    if (opponents.length === 0) continue

    try {
      const community = getCommunityAtStreet(h, street)
      const hands = [[heroCards[0], heroCards[1]], ...opponents]
      const equityResult = new EquityResult(hands, community)
      const equity = equityResult.getEquity(0)
      equityResult.free()

      results.push({
        handId: h.id,
        equity,
        actualResult: getActualResult(h),
        allInStreet: street,
      })
    } catch {
      // Skip failed calculations
    }

    processed++
    if (processed % 10 === 0) {
      postProgress('equity', processed, eligibleHands.length, `Calculating equity: ${processed}/${eligibleHands.length}`)
    }
  }

  return results
}

/**
 * Run bankroll simulation
 */
async function runBankrollSimulation(tournaments: TournamentSummary[]): Promise<BankrollWorkerResult[]> {
  await ensureWasmInit()

  const relativeReturns: number[] = []
  for (const t of tournaments) {
    const buyIn = getTournamentBuyIn(t)
    if (buyIn > 0) {
      relativeReturns.push(...getTournamentRRs(t))
    }
  }

  if (relativeReturns.length === 0) return []

  const initialCapitals = [10, 20, 50, 100, 200, 500]
  const maxIterations = Math.max(40000, tournaments.length * 10)
  const results: BankrollWorkerResult[] = []

  for (let i = 0; i < initialCapitals.length; i++) {
    const initialCapital = initialCapitals[i]
    postProgress('bankroll', i + 1, initialCapitals.length, `Simulating ${initialCapital} buy-ins...`)

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
      // Simulation failed
    }
  }

  return results
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, files, tournaments, handHistories, allowFreerolls } = event.data

  try {
    if (type === 'parse' && files) {
      postProgress('init', 0, 1, 'Initializing WASM...')
      await ensureWasmInit()
      const wasmVer = version()

      postProgress('parsing', 0, files.length, 'Parsing files...')
      const rateConverter = new CurrencyRateConverter()
      const parseResult = await loadAndParseFiles(files, rateConverter, allowFreerolls ?? false)

      postProgress('parsing', files.length, files.length, 'Parsing complete')

      self.postMessage({
        type: 'result',
        parseResult,
        wasmVersion: wasmVer,
      } as WorkerResult)
    }

    if (type === 'analyze') {
      await ensureWasmInit()

      let equityData: AllInEquityWorkerData[] = []
      let bankrollResults: BankrollWorkerResult[] = []

      // Calculate equity for all-in hands
      if (handHistories && handHistories.length > 0) {
        postProgress('equity', 0, 1, 'Starting equity calculations...')
        equityData = await calculateEquityData(handHistories)
      }

      // Run bankroll simulation
      if (tournaments && tournaments.length > 0) {
        postProgress('bankroll', 0, 1, 'Starting bankroll simulation...')
        bankrollResults = await runBankrollSimulation(tournaments)
      }

      postProgress('complete', 1, 1, 'Analysis complete')

      self.postMessage({
        type: 'result',
        equityData,
        bankrollResults,
      } as WorkerResult)
    }
  } catch (error) {
    self.postMessage({
      type: 'result',
      error: error instanceof Error ? error.message : String(error),
    } as WorkerResult)
  }
}
