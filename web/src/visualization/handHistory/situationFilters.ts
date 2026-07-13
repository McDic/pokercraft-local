/**
 * The filters both situation charts narrow their data with.
 *
 * Shared rather than duplicated because the two charts sit in one tab under one filter bar:
 * if they disagreed about what "Under 15bb" or "Heads-up" meant, the ledger and the hand
 * classes would be answering slightly different questions on the same screen, and nothing
 * on the page would say so.
 */

import type { PreflopSituation, OpenerBucket } from '../../analysis/preflopSituation'
import type { TranslationKey } from '../../i18n'

/**
 * The sample sizes worth offering, and the default.
 *
 * Below a few tens of decisions a row is noise dressed as a finding, so it is withheld
 * rather than drawn faintly — a faint row still reads as data.
 */
export const MIN_SAMPLE_CHOICES = [10, 30, 100, 300] as const
export const DEFAULT_MIN_SAMPLE = 30

export type StackBucket = 'short' | 'mid' | 'deepish' | 'deep'

/**
 * Table size, because a button offset means a different game at each one.
 *
 * Heads-up puts the button *on* the small blind, so `getHandHistoryOffsetFromButton`
 * reports the HU button as SB. An HU steal — where opening most of the deck is correct —
 * would otherwise be averaged into the same "Open raise · SB" row as a 6-max SB open, and
 * late-MTT play is heavily short-handed, so that is not a corner case.
 */
export type TableBucket = 'headsUp' | 'shorthanded' | 'full'

export interface SituationFilters {
  openerBucket: OpenerBucket | 'any'
  stackBucket: StackBucket | 'any'
  tableBucket: TableBucket | 'any'
  minSample: number
}

export const DEFAULT_FILTERS: SituationFilters = {
  openerBucket: 'any',
  stackBucket: 'any',
  tableBucket: 'any',
  minSample: DEFAULT_MIN_SAMPLE,
}

export const OPENER_BUCKET_KEYS: Array<[OpenerBucket, TranslationKey]> = [
  ['ep', 'chart.situation.opener.ep'],
  ['mp', 'chart.situation.opener.mp'],
  ['lp', 'chart.situation.opener.lp'],
  ['blinds', 'chart.situation.opener.blinds'],
]

export const STACK_BUCKET_KEYS: Array<[StackBucket, TranslationKey]> = [
  ['short', 'chart.situation.stack.short'],
  ['mid', 'chart.situation.stack.mid'],
  ['deepish', 'chart.situation.stack.deepish'],
  ['deep', 'chart.situation.stack.deep'],
]

export const TABLE_BUCKET_KEYS: Array<[TableBucket, TranslationKey]> = [
  ['headsUp', 'chart.situation.table.headsUp'],
  ['shorthanded', 'chart.situation.table.shorthanded'],
  ['full', 'chart.situation.table.full'],
]

export function stackBucketOf(stackBB: number): StackBucket {
  if (stackBB < 15) return 'short'
  if (stackBB < 25) return 'mid'
  if (stackBB < 40) return 'deepish'
  return 'deep'
}

export function tableBucketOf(tableSize: number): TableBucket {
  if (tableSize <= 2) return 'headsUp'
  if (tableSize <= 6) return 'shorthanded'
  return 'full'
}

export function passesFilters(s: PreflopSituation, f: SituationFilters): boolean {
  if (f.openerBucket !== 'any' && s.openerBucket !== f.openerBucket) return false
  if (f.stackBucket !== 'any' && stackBucketOf(s.heroStackBB) !== f.stackBucket) return false
  if (f.tableBucket !== 'any' && tableBucketOf(s.tableSize) !== f.tableBucket) return false
  return true
}
