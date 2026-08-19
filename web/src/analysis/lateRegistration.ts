/**
 * Late-registration analysis — does registering late (entering shallow) affect your ROI?
 *
 * A hand history alone knows how deep you were when you entered but not what the entry
 * returned; a tournament summary alone knows the return but not when you sat down. Joined on
 * the exact integer key (`TournamentSummary.id` === `HandHistory.tournamentId`), your first
 * recorded hand becomes the registration moment: GG deals you in right after you register, so
 * the stack-to-big-blind ratio of that hand *is* your entry depth.
 *
 * The unit is one **entry**, not one tournament. Re-entries always register late, so folding
 * them into their tournament would launder precisely the signal being measured. Each re-entry
 * lifecycle (split on busts by `generateSequences`) is its own data point, and the return is
 * attributed the way `getTournamentRRs` defines: every busted entry returned −1 buy-in, the
 * final entry carries the whole prize. A summary only knows the prize per *tournament*, so
 * this attribution is exact for the busted entries and conservative-by-construction for the
 * last one.
 *
 * A tournament whose lifecycle count disagrees with the summary's entry count is dropped and
 * counted, never silently kept: the mismatch means the download is missing hands (typically
 * the bust hand that would have split two lifecycles), so *every* per-entry number derived
 * from it is suspect.
 */

import type { TournamentSummary, HandHistory, SequentialHandHistories } from '../types'
import {
  generateSequences,
  getHandHistoryInitialChips,
  getTournamentBuyIn,
  getTournamentRRs,
} from '../types'

/** GG labels the downloading player with this literal id in every hand. */
const HERO = 'Hero'

export interface LateRegEntry {
  tournamentId: number
  /** 0-based lifecycle index within the tournament (0 = first bullet). */
  entryIndex: number
  /** Total entries the summary reports for this tournament. */
  totalEntries: number
  /** Hero's stack in big blinds at the first recorded hand of this entry. */
  stackBB: number
  /** Minutes between the tournament's official start and the entry's first hand (≥ 0). */
  minutesLate: number
  /** Blind level of the entry's first hand (1 = the structure's first level). */
  level: number
  /** This entry's relative return: −1 for a busted bullet, prize/buyIn − 1 for the last. */
  rr: number
  /** The same attribution in USD: −buyIn for a busted bullet, prize − buyIn for the last. */
  profitUsd: number
  /** Full buy-in (with rake) of one entry, in USD. */
  buyIn: number
}

export interface LateRegResult {
  entries: LateRegEntry[]
  /** Tournaments contributing to `entries` (each contributes `myEntries` of them). */
  joinedTournaments: number
  /** Joined tournaments dropped because lifecycle count ≠ myEntries (incomplete download). */
  skippedMismatch: number
}

/**
 * Join tournament summaries with hand histories into one row per entry.
 * Pure and read-only over both inputs; inner join, so tournaments present in only one
 * dataset are simply absent (each dataset stays independently useful).
 */
export function analyzeLateRegistration(
  tournaments: TournamentSummary[],
  handHistories: HandHistory[]
): LateRegResult {
  const summaryById = new Map<number, TournamentSummary>()
  for (const t of tournaments) summaryById.set(t.id, t)

  // Lifecycles (already chronological within themselves) grouped by joinable tournament.
  const lifecyclesByTournament = new Map<number, SequentialHandHistories[]>()
  for (const seq of generateSequences(handHistories)) {
    const tid = seq.histories[0].tournamentId
    if (tid === null || !summaryById.has(tid)) continue
    const arr = lifecyclesByTournament.get(tid)
    if (arr) arr.push(seq)
    else lifecyclesByTournament.set(tid, [seq])
  }

  const entries: LateRegEntry[] = []
  let joinedTournaments = 0
  let skippedMismatch = 0

  for (const [tid, seqs] of lifecyclesByTournament) {
    const summary = summaryById.get(tid) as TournamentSummary
    const buyIn = getTournamentBuyIn(summary)
    // Freerolls: a relative return is undefined at buy-in 0 (getTournamentRRs agrees, returning []).
    if (buyIn <= 0) continue

    const rrs = getTournamentRRs(summary) // length === myEntries, prize on the last element
    if (seqs.length !== rrs.length) {
      skippedMismatch += 1
      continue
    }

    joinedTournaments += 1
    seqs.sort((a, b) => a.reEntryNumber - b.reEntryNumber)
    seqs.forEach((seq, i) => {
      const first = seq.histories[0]
      entries.push({
        tournamentId: tid,
        entryIndex: seq.reEntryNumber,
        totalEntries: summary.myEntries,
        stackBB: getHandHistoryInitialChips(first, HERO) / first.bb,
        minutesLate: Math.max(
          0,
          (first.datetime.getTime() - summary.startTime.getTime()) / 60_000
        ),
        level: first.level,
        rr: rrs[i],
        profitUsd: i === rrs.length - 1 ? summary.myPrize - buyIn : -buyIn,
        buyIn,
      })
    })
  }

  return { entries, joinedTournaments, skippedMismatch }
}
