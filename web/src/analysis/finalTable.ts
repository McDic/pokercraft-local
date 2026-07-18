/**
 * Final-Table analysis — the one place tournament summaries and hand histories are joined.
 *
 * A single player's hand history cannot, on its own, tell you whether a table was the final
 * table (GG hand histories carry no final-table marker, no placement, no remaining-player count,
 * and seat-count quirks like 8->9 expansion or 2-max heads-up spin-off tables are format-specific).
 * The tournament *summary* supplies exactly what's missing — exact entrant count and exact finish
 * position — and shares the exact integer key `Tournament #<id>` with the hand history. So this is a
 * primary-key join, not a fuzzy merge: `TournamentSummary.id` === `HandHistory.tournamentId`.
 *
 * Reached-final-table test (a finish of rank R means only R players remained, so R <= the table's
 * capacity implies a single table was left = the final table):
 *
 *     summary.myRank <= maxSeats(final table)
 *
 * This is robust to simultaneous bust-outs and to the heads-up spin-off (e.g. a tournament whose
 * last table is a dedicated 2-max heads-up table: a 1st-place finish still satisfies 1 <= 2).
 */

import type { TournamentSummary, HandHistory } from '../types'

/** GG labels the downloading player with this literal id in every hand. */
const HERO = 'Hero'

/** Sentinel `maxSeats` the parser leaves when a hand's `Table '...' N-max` line didn't parse. */
const UNKNOWN_MAX_SEATS = 999

/**
 * Minimum field size to include. Below this the events are single-table SNG satellites
 * (AoF Hyper / FlipNGo), whose trivial "final tables" swamp the list.
 */
const MIN_ENTRANTS = 10

/**
 * Satellites and qualifiers award entry to another event rather than a cash finish, and their
 * tiny final tables are noise here. GG names every one of them with the qualifier structure
 * "<buy-in> ... to <target event>" (Step to, Mega to, Ultra to, Flipout to, Sat to, Deadline to,
 * Freeroll to, Last Chance to, ...) or an explicit "Satellite". Across the whole dataset a
 * whole-word "to" appears only in satellites — no cash MTT uses it.
 *
 * Deliberately keyed on "to"/"satellite", NOT on the format word: "Flip & Go [Go Stage]" is the
 * real playable tournament and "Daily $100,000 #ThanksGG Flipout" is a real cash event — neither
 * is a satellite, and neither has "to"/"satellite" in its name. The one exception is a Flip & Go
 * "[Flip Stage]", the all-in qualifier phase that feeds the Go Stage — that counts as a satellite.
 */
export function isSatelliteName(name: string): boolean {
  const n = name.toLowerCase()
  return /\bto\b/.test(n) || /\bsatellite\b/.test(n) || /flip stage/.test(n)
}

export interface FinalTableRow {
  tournamentId: number
  name: string
  startTime: Date
  /** Total entrants (from the summary). */
  entrants: number
  /** Finishing place (from the summary). */
  finish: number
  /** Seat capacity of the final table (e.g. 8 or 9). */
  finalTableSize: number
  /** Players seated in the Hero's first final-table hand. */
  entrySeated: number
  /** Hero's stack rank among seated players at entry (1 = chip leader). */
  entryRank: number
  /** Hero's chips / total chips in play at entry (0..1). At the final table this is the whole field. */
  entryChipRatio: number
  /** The tournament had re-entries, so the row reflects the Hero's final lifecycle. */
  reentry: boolean
}

export interface FinalTableSkip {
  tournamentId: number
  name: string
  reason: string
}

export interface FinalTableResult {
  rows: FinalTableRow[]
  /** Joined tournaments that did not qualify as a final-table reach, with why (never silently dropped). */
  skipped: FinalTableSkip[]
}

interface TableRun {
  tableId: string
  hands: HandHistory[]
}

/** Partition chronologically-ordered hands into runs of adjacent hands sharing a table id. */
function partitionRuns(handsChrono: HandHistory[]): TableRun[] {
  const runs: TableRun[] = []
  for (const h of handsChrono) {
    const last = runs[runs.length - 1]
    if (last && last.tableId === h.tableId) last.hands.push(h)
    else runs.push({ tableId: h.tableId, hands: [h] })
  }
  return runs
}

function analyzeOne(
  summary: TournamentSummary,
  hands: HandHistory[]
): FinalTableRow | { reason: string } {
  // Policy filters first: satellites and micro-field events are excluded regardless of whether
  // the Hero reached their (trivial) final table.
  if (isSatelliteName(summary.name)) return { reason: 'excluded: satellite / qualifier' }
  if (summary.totalPlayers < MIN_ENTRANTS) {
    return { reason: `excluded: field of ${summary.totalPlayers} (< ${MIN_ENTRANTS})` }
  }

  const chrono = [...hands].sort((a, b) => a.datetime.getTime() - b.datetime.getTime())
  const runs = partitionRuns(chrono)
  if (runs.length === 0) return { reason: 'no hands' }

  // The final table is the last run. If the last run is a dedicated 2-max heads-up spin-off table,
  // the final table proper is the run just before it — fold the two into one session and take the
  // entry hand (and capacity) from the proper run.
  const lastRun = runs[runs.length - 1]
  const ftProper =
    lastRun.hands[0].maxSeats === 2 && runs.length >= 2 ? runs[runs.length - 2] : lastRun

  const entryHand = ftProper.hands[0]
  const finalTableSize = entryHand.maxSeats
  if (finalTableSize <= 0 || finalTableSize >= UNKNOWN_MAX_SEATS) {
    return { reason: 'final-table capacity unknown (table line unparsed)' }
  }

  // The user's rule: a finish that fits within one table means the Hero was at the final table.
  if (summary.myRank > finalTableSize) {
    return {
      reason: `busted before the final table (finish ${summary.myRank} > table capacity ${finalTableSize}), or truncated download`,
    }
  }

  let heroChips: number | null = null
  const stacks: number[] = []
  for (const [, [pid, chips]] of entryHand.seats) {
    stacks.push(chips)
    if (pid === HERO) heroChips = chips
  }
  if (heroChips === null) return { reason: 'Hero not seated at the final-table entry hand' }

  const total = stacks.reduce((sum, s) => sum + s, 0)
  const entryRank = 1 + stacks.filter(s => s > (heroChips as number)).length

  return {
    tournamentId: summary.id,
    name: summary.name,
    startTime: summary.startTime,
    entrants: summary.totalPlayers,
    finish: summary.myRank,
    finalTableSize,
    entrySeated: entryHand.seats.size,
    entryRank,
    entryChipRatio: total > 0 ? heroChips / total : 0,
    reentry: summary.myEntries > 1,
  }
}

/**
 * Join tournament summaries with hand histories to describe every final table the Hero reached.
 * Pure and read-only over both inputs. Only tournaments present in *both* datasets are considered;
 * tournaments without a matching summary are simply absent (each dataset stays independently useful).
 */
export function analyzeFinalTables(
  tournaments: TournamentSummary[],
  handHistories: HandHistory[]
): FinalTableResult {
  const summaryById = new Map<number, TournamentSummary>()
  for (const t of tournaments) summaryById.set(t.id, t)

  // Group hands by tournament id, keeping only tournaments we can join to a summary.
  const handsByTournament = new Map<number, HandHistory[]>()
  for (const h of handHistories) {
    if (h.tournamentId === null || !summaryById.has(h.tournamentId)) continue
    const arr = handsByTournament.get(h.tournamentId)
    if (arr) arr.push(h)
    else handsByTournament.set(h.tournamentId, [h])
  }

  const rows: FinalTableRow[] = []
  const skipped: FinalTableSkip[] = []
  for (const [tid, hands] of handsByTournament) {
    const summary = summaryById.get(tid) as TournamentSummary
    const result = analyzeOne(summary, hands)
    if ('reason' in result) {
      skipped.push({ tournamentId: tid, name: summary.name, reason: result.reason })
    } else {
      rows.push(result)
    }
  }

  rows.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
  return { rows, skipped }
}
