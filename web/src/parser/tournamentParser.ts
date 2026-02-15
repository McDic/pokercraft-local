/**
 * Tournament Summary Parser
 * Parses GG Poker tournament summary files
 */

import type { TournamentSummary } from '../types'
import { Currency } from '../types'
import {
  CurrencyRateConverter,
  takeAllMoney,
  takeFirstInt,
  parseDatetime,
  detectCurrency,
} from './utils'

// Regex patterns for tournament summary files
const LINE1_ID_NAME = /^Tournament #\d+, .+, .+$/
const LINE2_BUYIN = /^Buy-in: .+$/
const LINE3_ENTRIES = /^\d+ Players$/
const LINE4_PRIZEPOOL = /^Total Prize Pool: .+$/
const LINE5_START_TIME = /^Tournament started \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/
const LINE6_MY_RANK_AND_PRIZE = /^\d+(st|nd|rd|th) : Hero, .+$/
const LINE8_MY_PRIZE = /^You (made \d+( re)?-entries and )?received a total of .+$/
const LINE8_REENTRIES = /^You made \d+( re)?-entries .+$/

// Filename pattern for tournament summary files
export const TOURNAMENT_SUMMARY_FILENAME_PATTERN = /^GG\d{8} - Tournament #\d+ - /

/**
 * Check if a filename matches tournament summary pattern
 */
export function isTournamentSummaryFile(filename: string): boolean {
  return (
    filename.endsWith('.txt') &&
    TOURNAMENT_SUMMARY_FILENAME_PATTERN.test(filename)
  )
}

/**
 * Parse a single tournament summary file
 */
export function parseTournamentSummary(
  content: string,
  rateConverter: CurrencyRateConverter,
  allowFreerolls: boolean = false
): TournamentSummary | null {
  let id: number | null = null
  let name: string | null = null
  let buyInPure: number | null = null
  let rake: number | null = null
  let totalPrizePool: number | null = null
  let startTime: Date | null = null
  let myRank: number | null = null
  let totalPlayers: number | null = null
  let myPrize: number | null = null
  let myEntries = 1

  let firstDetectedCurrency: Currency | null = null

  const lines = content.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Detect currency from early lines
    if (!firstDetectedCurrency) {
      for (const currency of Object.values(Currency)) {
        if (line.includes(currency)) {
          firstDetectedCurrency = detectCurrency(currency)
          break
        }
      }
    }

    // Line 1: Tournament ID and Name
    if (LINE1_ID_NAME.test(line)) {
      const parts = line.split(',').map(s => s.trim())
      const idMatch = parts[0].match(/\d+/)
      if (idMatch) {
        id = parseInt(idMatch[0], 10)
      }
      // Name is everything between first and last comma
      name = parts.slice(1, -1).join(',')
    }

    // Line 2: Buy-in
    else if (LINE2_BUYIN.test(line)) {
      const buyIns = [...takeAllMoney(line, rateConverter, firstDetectedCurrency ?? undefined)]
        .sort((a, b) => a - b)

      if (buyIns.length > 0) {
        rake = buyIns[0]
        buyInPure = buyIns.reduce((a, b) => a + b, 0) - rake

        // If rake is too big (>30%), probably no rake is specified
        if (rake >= 0.3 * (buyInPure + rake)) {
          buyInPure += rake
          rake = 0
        }
      } else {
        // Freeroll
        buyInPure = 0
        rake = 0
      }
    }

    // Line 3: Total players
    else if (LINE3_ENTRIES.test(line)) {
      totalPlayers = takeFirstInt(line)
    }

    // Line 4: Prize pool
    else if (LINE4_PRIZEPOOL.test(line)) {
      const prizes = [...takeAllMoney(line, rateConverter, firstDetectedCurrency ?? undefined)]
      if (prizes.length > 0) {
        totalPrizePool = prizes[0]
      }
    }

    // Line 5: Start time
    else if (LINE5_START_TIME.test(line)) {
      const parts = line.split(' ')
      startTime = parseDatetime(parts[parts.length - 2], parts[parts.length - 1])
    }

    // Line 6: My rank and prize (in payout list)
    else if (LINE6_MY_RANK_AND_PRIZE.test(line)) {
      myRank = takeFirstInt(line)
      const prizes = [...takeAllMoney(line, rateConverter, firstDetectedCurrency ?? undefined)]
      myPrize = prizes.reduce((a, b) => a + b, 0)

      // Flip & Go displays "$0 Entry" as prize
      if (myPrize <= 0 && line.includes('$0 Entry') && buyInPure !== null && rake !== null) {
        myPrize = buyInPure + rake
      }
    }

    // Line 8: Re-entries
    else if (LINE8_MY_PRIZE.test(line)) {
      if (LINE8_REENTRIES.test(line)) {
        myEntries += takeFirstInt(line)
      }
    }
  }

  // Validate we have all required fields
  if (
    id === null ||
    name === null ||
    buyInPure === null ||
    rake === null ||
    totalPrizePool === null ||
    startTime === null ||
    myRank === null ||
    totalPlayers === null ||
    myPrize === null
  ) {
    return null
  }

  // Skip freerolls if not allowed
  if (!allowFreerolls && buyInPure + rake === 0) {
    return null
  }

  return {
    id,
    name,
    buyInPure,
    rake,
    totalPrizePool,
    startTime,
    myRank,
    totalPlayers,
    myPrize,
    myEntries,
  }
}
