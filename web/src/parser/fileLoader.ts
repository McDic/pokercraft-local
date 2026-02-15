/**
 * File loader utility
 * Handles loading and extracting files from both .txt and .zip files
 */

import JSZip from 'jszip'
import type { TournamentSummary, HandHistory, ParseResult } from '../types'
import { CurrencyRateConverter } from './utils'
import { parseTournamentSummary, isTournamentSummaryFile } from './tournamentParser'
import { parseHandHistory, isHandHistoryFile } from './handHistoryParser'

export interface LoadedFile {
  name: string
  content: string
}

/**
 * Check if a file is a valid target file (tournament summary or hand history)
 */
export function isTargetFile(filename: string): boolean {
  return isTournamentSummaryFile(filename) || isHandHistoryFile(filename)
}

/**
 * Load files from a File object (handles both .txt and .zip)
 */
export async function loadFile(file: File): Promise<LoadedFile[]> {
  const results: LoadedFile[] = []

  if (file.name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file)

    for (const [name, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue

      const filename = name.split('/').pop() ?? name
      if (!isTargetFile(filename)) continue

      const content = await zipEntry.async('string')
      results.push({ name: filename, content })
    }
  } else if (file.name.endsWith('.txt')) {
    if (isTargetFile(file.name)) {
      const content = await file.text()
      results.push({ name: file.name, content })
    }
  }

  return results
}

/**
 * Load multiple files
 */
export async function loadFiles(files: FileList | File[]): Promise<LoadedFile[]> {
  const results: LoadedFile[] = []
  const fileArray = Array.from(files)

  for (const file of fileArray) {
    const loaded = await loadFile(file)
    results.push(...loaded)
  }

  return results
}

/**
 * Parse a single file
 */
function parseFileContent(
  filename: string,
  content: string,
  rateConverter: CurrencyRateConverter,
  allowFreerolls: boolean
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
 * Load and parse files directly
 */
export async function loadAndParseFiles(
  files: FileList | File[],
  rateConverter: CurrencyRateConverter,
  allowFreerolls: boolean = false
): Promise<ParseResult> {
  const loaded = await loadFiles(files)

  const tournaments: TournamentSummary[] = []
  const handHistories: HandHistory[] = []
  const errors: string[] = []

  for (const { name, content } of loaded) {
    const result = parseFileContent(name, content, rateConverter, allowFreerolls)
    tournaments.push(...result.tournaments)
    handHistories.push(...result.handHistories)
    if (result.error) {
      errors.push(`${name}: ${result.error}`)
    }
  }

  return { tournaments, handHistories, errors }
}
