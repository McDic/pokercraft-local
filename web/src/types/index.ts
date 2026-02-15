/**
 * Core data types for Pokercraft Local Web
 * Ported from Python's data_structures.py
 */

// ============================================================================
// Currency Types
// ============================================================================

export const Currency = {
  USD: '$',
  CNY: '¥',
  THB: '฿',
  VND: '₫',
  PHP: '₱',
  KRW: '₩',
} as const

export type Currency = (typeof Currency)[keyof typeof Currency]

export const DEFAULT_USD_RATES: Record<Currency, number> = {
  [Currency.USD]: 1.0,
  [Currency.CNY]: 7.25,
  [Currency.THB]: 34.61,
  [Currency.VND]: 25420.0,
  [Currency.PHP]: 58.98,
  [Currency.KRW]: 1399.58,
}

// ============================================================================
// Card Types (mirrors WASM types)
// ============================================================================

export type HandStage = 'preflop' | 'flop' | 'turn' | 'river'

// Card representation as string (e.g., "As", "Kh", "2c")
export type CardString = string

export interface Hand {
  card1: CardString
  card2: CardString
}

// ============================================================================
// Tournament Summary
// ============================================================================

export interface TournamentSummary {
  id: number
  name: string
  buyInPure: number  // Buy-in without rake (in USD)
  rake: number       // Rake amount (in USD)
  totalPrizePool: number
  startTime: Date
  myRank: number
  totalPlayers: number
  myPrize: number
  myEntries: number
}

// Computed properties for TournamentSummary
export function getTournamentBuyIn(t: TournamentSummary): number {
  return t.buyInPure + t.rake
}

export function getTournamentProfit(t: TournamentSummary): number {
  return t.myPrize - getTournamentBuyIn(t) * t.myEntries
}

/**
 * RRE = Relative Return with re-Entries
 * Examples:
 * - $3 prize from $1 buy-in returns 3.0
 * - No prize from $2 buy-in returns 0.0
 * - $5 prize from $1 buy-in with 3 re-entries returns 1.25
 */
export function getTournamentRRE(t: TournamentSummary): number {
  const buyIn = getTournamentBuyIn(t)
  if (buyIn > 0) {
    return t.myPrize / buyIn / t.myEntries
  }
  return NaN
}

/**
 * Get list of relative returns.
 * Unlike RRE, this adds -1 on each element.
 */
export function getTournamentRRs(t: TournamentSummary): number[] {
  const buyIn = getTournamentBuyIn(t)
  if (buyIn > 0) {
    const entries = Array(t.myEntries - 1).fill(-1.0)
    entries.push(t.myPrize / buyIn - 1.0)
    return entries
  }
  return []
}

/**
 * Get time of week for heatmap visualization.
 * Returns [dayOfWeek (0=Mon, 6=Sun), minuteOfDay (0-1439)]
 */
export function getTournamentTimeOfWeek(t: TournamentSummary): [number, number] {
  const day = (t.startTime.getDay() + 6) % 7  // Convert Sun=0 to Mon=0
  const minute = t.startTime.getHours() * 60 + t.startTime.getMinutes()
  return [day, minute]
}

// ============================================================================
// Betting Actions
// ============================================================================

export type BetActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'ante' | 'blind'

export interface BetAction {
  playerId: string  // Player ID or "Hero"
  action: BetActionType
  amount: number    // Chip amount
  isAllIn: boolean
}

// ============================================================================
// Hand History
// ============================================================================

export interface HandHistory {
  id: string  // "TM000000"
  tournamentId: number | null
  tournamentName: string | null
  level: number
  sb: number  // Small blind amount
  bb: number  // Big blind amount
  datetime: Date
  buttonSeat: number
  sbSeat: number | null  // SB seat is optional (heads-up)
  bbSeat: number
  maxSeats: number

  // Seat number -> [playerId, initialChips]
  seats: Map<number, [string, number]>

  // Player ID -> [card1, card2] (known hole cards)
  knownCards: Map<string, [CardString, CardString]>

  // Player ID -> amount won
  wons: Map<string, number>

  communityCards: CardString[]
  actionsPreflop: BetAction[]
  actionsFlop: BetAction[]
  actionsTurn: BetAction[]
  actionsRiver: BetAction[]

  uncalledReturned: [string, number] | null  // [playerId, amount]

  // Player ID -> street where they went all-in
  allIned: Map<string, HandStage>
}

// Helper functions for HandHistory
export function getHandHistoryInitialChips(h: HandHistory, playerId: string): number {
  for (const [, [pid, chips]] of h.seats) {
    if (pid === playerId) return chips
  }
  throw new Error(`Player ${playerId} is not in this hand`)
}

export function getHandHistorySeatNumber(h: HandHistory, playerId: string): number {
  for (const [seat, [pid]] of h.seats) {
    if (pid === playerId) return seat
  }
  throw new Error(`Player ${playerId} is not in this hand`)
}

export function getHandHistoryTotalPot(h: HandHistory): number {
  let total = 0
  for (const amount of h.wons.values()) {
    total += amount
  }
  return total
}

export function getHandHistoryShowdownPlayers(h: HandHistory): Set<string> {
  const players = new Set<string>()
  for (const [, [playerId]] of h.seats) {
    players.add(playerId)
  }

  const allActions = [
    ...h.actionsPreflop,
    ...h.actionsFlop,
    ...h.actionsTurn,
    ...h.actionsRiver,
  ]

  for (const action of allActions) {
    if (action.action === 'fold') {
      players.delete(action.playerId)
    }
  }

  return players
}

/**
 * Calculate total chips a player put into the pot
 */
export function getHandHistoryTotalChipsPut(h: HandHistory, playerId: string): number {
  let totalBet = 0

  // Count ante separately
  for (const action of h.actionsPreflop) {
    if (action.action === 'ante' && action.playerId === playerId) {
      totalBet += action.amount
    }
  }

  // Count bets/calls/raises per street
  for (const street of [h.actionsPreflop, h.actionsFlop, h.actionsTurn, h.actionsRiver]) {
    let latestBet = 0
    for (const action of street) {
      if (action.playerId !== playerId) continue

      switch (action.action) {
        case 'fold':
        case 'check':
          break
        case 'call':
        case 'bet':
        case 'blind':
          latestBet += action.amount
          break
        case 'raise':
          latestBet = action.amount
          break
      }
    }
    totalBet += latestBet
  }

  if (h.uncalledReturned && h.uncalledReturned[0] === playerId) {
    totalBet -= h.uncalledReturned[1]
  }

  return totalBet
}

export function getHandHistoryNetProfit(h: HandHistory, playerId: string): number {
  return (h.wons.get(playerId) ?? 0) - getHandHistoryTotalChipsPut(h, playerId)
}

// ============================================================================
// Parse Result Container
// ============================================================================

export interface ParseResult {
  tournaments: TournamentSummary[]
  handHistories: HandHistory[]
  errors: string[]
}
