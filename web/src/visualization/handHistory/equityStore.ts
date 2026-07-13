/**
 * The store of computed all-in equity.
 *
 * All-in equity is the one genuinely expensive thing the app does:
 * `collectAllInDataAsync` spawns a pool of up to 8 Web Workers, each of which loads a
 * 686 KB preflop cache and initialises WASM, and none of which can be aborted once
 * started. So the rule is that no hand's equity is ever computed twice — not by a later
 * upload, and not by an upload that lands while an earlier one is still being worked on.
 * This module is what enforces that.
 *
 * (Hands with no all-in never produce a result, so they are never cached and are re-offered
 * on every call. That costs nothing: `collectAllInDataAsync` finds none of them eligible
 * and returns without spawning a worker.)
 */

import type { HandHistory } from '../../types'
import { collectAllInDataAsync, type AllInHandData } from './allInEquityAsync'

/** A batch of hands currently being computed. */
interface Pass {
  promise: Promise<void>
  /** Live progress, so a caller *waiting* on this pass can report it too. */
  done: number
  total: number
  /** Callers to nudge when the numbers move. */
  watchers: Set<() => void>
}

/** Hands whose equity is known. */
const cache = new Map<string, AllInHandData>()

/**
 * Hands being computed *right now*, and the pass computing them.
 *
 * The cache alone is not enough, because it can only be written once a whole batch has
 * resolved. A second upload landing mid-pass would therefore see every in-flight hand as
 * uncached and start a *second* worker pool on hands the first pool was already grinding
 * — two unabortable pools fighting over the CPU to compute the same WASM twice.
 */
const inFlight = new Map<string, Pass>()

/**
 * The equity for every one of `hands` that has any, computing whatever is missing.
 *
 * Safe to call while an earlier call is still running: hands already in flight are waited
 * for rather than recomputed, and only genuinely new ones are handed to workers.
 */
export async function loadEquity(
  hands: HandHistory[],
  onProgress?: (current: number, total: number) => void
): Promise<AllInHandData[]> {
  const missing = hands.filter(h => !cache.has(h.id) && !inFlight.has(h.id))
  const waitingOn = [
    ...new Set(hands.map(h => inFlight.get(h.id)).filter((p): p is Pass => p != null)),
  ]

  if (missing.length > 0) {
    const pass: Pass = {
      // Deferred deliberately. `collectAllInDataAsync` runs synchronously — filtering,
      // spawning its workers, firing its first `onProgress` — right up to its first
      // await. Calling it inline would therefore have the pool already up and reporting
      // before the claims below existed. Nothing can currently observe that gap, but the
      // claim being *actually* first is the invariant this module rests on, and it should
      // not depend on an implementation detail of a function in another file.
      promise: Promise.resolve().then(() => run(pass, missing)),
      done: 0,
      total: 0,
      watchers: new Set(),
    }

    for (const h of missing) inFlight.set(h.id, pass)

    const release = () => {
      for (const h of missing) {
        if (inFlight.get(h.id) === pass) inFlight.delete(h.id)
      }
    }
    // Released on failure too, so a transient error leaves the hands retryable instead of
    // claimed forever by a pass that will never finish. Callers still see the rejection,
    // through the await below.
    pass.promise.then(release, release)

    waitingOn.push(pass)
  }

  // Report the union of every pass this call is waiting on — including ones it did not
  // start. Reporting only our own would freeze the bar on a completed count while another
  // pass, holding hands we need, ground on invisibly.
  const report = () => {
    if (!onProgress) return
    let done = 0
    let total = 0
    for (const pass of waitingOn) {
      done += pass.done
      total += pass.total
    }
    if (total > 0) onProgress(done, total)
  }
  for (const pass of waitingOn) pass.watchers.add(report)

  try {
    await Promise.all(waitingOn.map(p => p.promise))
  } finally {
    for (const pass of waitingOn) pass.watchers.delete(report)
  }

  return hands.map(h => cache.get(h.id)).filter((d): d is AllInHandData => d !== undefined)
}

async function run(pass: Pass, hands: HandHistory[]): Promise<void> {
  const { data } = await collectAllInDataAsync(hands, (current, total) => {
    pass.done = current
    pass.total = total
    for (const watch of pass.watchers) watch()
  })
  for (const d of data) cache.set(d.handId, d)
}

/** Test seam. Without it, module state would leak between test cases. */
export function resetEquityStore(): void {
  cache.clear()
  inFlight.clear()
}
