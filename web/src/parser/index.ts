/**
 * Parser module for Pokercraft Local Web
 * Handles parsing of GG Poker tournament summaries and hand histories
 */

export {
  CurrencyRateConverter,
  convertMoneyToFloat,
  takeAllMoney,
  takeFirstInt,
  parseDatetime,
  detectCurrency,
} from './utils'

export {
  parseTournamentSummary,
  isTournamentSummaryFile,
  TOURNAMENT_SUMMARY_FILENAME_PATTERN,
} from './tournamentParser'

export {
  parseHandHistory,
  isHandHistoryFile,
  HAND_HISTORY_FILENAME_PATTERN,
} from './handHistoryParser'

export {
  loadFile,
  loadFiles,
  loadAndParseFiles,
  isTargetFile,
} from './fileLoader'
export type { LoadedFile } from './fileLoader'

import type { TournamentSummary, HandHistory, ParseResult } from '../types'
import { CurrencyRateConverter } from './utils'
import { parseTournamentSummary, isTournamentSummaryFile } from './tournamentParser'
import { parseHandHistory, isHandHistoryFile } from './handHistoryParser'

/**
 * Parse a single file based on its filename
 */
export function parseFile(
  filename: string,
  content: string,
  rateConverter: CurrencyRateConverter,
  allowFreerolls: boolean = false
): { tournaments: TournamentSummary[]; handHistories: HandHistory[]; error?: string } {
  const tournaments: TournamentSummary[] = []
  const handHistories: HandHistory[] = []

  try {
    if (isTournamentSummaryFile(filename)) {
      const result = parseTournamentSummary(content, rateConverter, allowFreerolls)
      if (result) {
        tournaments.push(result)
      }
    } else if (isHandHistoryFile(filename)) {
      const results = parseHandHistory(content)
      handHistories.push(...results)
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { tournaments, handHistories, error }
  }

  return { tournaments, handHistories }
}

/**
 * Parse multiple files
 */
export function parseFiles(
  files: Array<{ name: string; content: string }>,
  rateConverter: CurrencyRateConverter,
  allowFreerolls: boolean = false
): ParseResult {
  const tournaments: TournamentSummary[] = []
  const handHistories: HandHistory[] = []
  const errors: string[] = []

  for (const file of files) {
    const result = parseFile(file.name, file.content, rateConverter, allowFreerolls)
    tournaments.push(...result.tournaments)
    handHistories.push(...result.handHistories)
    if (result.error) {
      errors.push(`${file.name}: ${result.error}`)
    }
  }

  return { tournaments, handHistories, errors }
}
