/**
 * File loader utility
 * Handles loading and extracting files from both .txt and .zip files
 */

import JSZip from 'jszip'
import type { TournamentSummary, HandHistory, ParseResult } from '../types'
import { CurrencyRateConverter } from './utils'
import { parseTournamentSummary, isTournamentSummaryFile } from './tournamentParser'
import { parseHandHistory, isHandHistoryFile } from './handHistoryParser'
import { yieldToBrowser } from '../utils'

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
 * Load and parse files directly with progress reporting
 */
export async function loadAndParseFiles(
  files: FileList | File[],
  rateConverter: CurrencyRateConverter,
  allowFreerolls: boolean = false,
  onProgress?: (current: number, total: number, stage: 'loading' | 'parsing') => void
): Promise<ParseResult> {
  const fileArray = Array.from(files)
  const loaded: LoadedFile[] = []

  // Load files with progress
  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i]
    const fileLoaded = await loadFile(file)
    loaded.push(...fileLoaded)

    // Yield every 10 files or at the end
    if ((i + 1) % 10 === 0 || i === fileArray.length - 1) {
      onProgress?.(i + 1, fileArray.length, 'loading')
      await yieldToBrowser()
    }
  }

  const tournaments: TournamentSummary[] = []
  const handHistories: HandHistory[] = []
  const errors: string[] = []

  // Parse files with progress
  for (let i = 0; i < loaded.length; i++) {
    const { name, content } = loaded[i]
    const result = parseFileContent(name, content, rateConverter, allowFreerolls)
    tournaments.push(...result.tournaments)
    handHistories.push(...result.handHistories)
    if (result.error) {
      errors.push(`${name}: ${result.error}`)
    }

    // Yield every 50 files or at the end
    if ((i + 1) % 50 === 0 || i === loaded.length - 1) {
      onProgress?.(i + 1, loaded.length, 'parsing')
      await yieldToBrowser()
    }
  }

  return { tournaments, handHistories, errors }
}
