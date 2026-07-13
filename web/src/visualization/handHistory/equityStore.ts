/**
 * The store of computed all-in equity.
 *
 * All-in equity is the one genuinely expensive thing the app does: `collectAllInDataAsync`
 * spawns a pool of up to 8 Web Workers, each of which loads a 686 KB preflop cache and
 * initialises WASM, and none of which can be aborted once started. So the rule is that a
 * hand's equity is computed exactly once, ever — and this module is what enforces it.
 */

import type { HandHistory } from '../../types'
import { collectAllInDataAsync, type AllInHandData } from './allInEquityAsync'

/** Hands whose equity is known. */
const cache = new Map<string, AllInHandData>()

/**
 * Hands whose equity is being computed *right now*, and the pass computing them.
 *
 * The cache alone is not enough, because it can only be written once a whole batch has
 * resolved. A second upload landing mid-pass would therefore see every in-flight hand as
 * uncached and start a *second* worker pool on hands the first pool was already grinding
 * — two unabortable pools fighting over the CPU to compute the same WASM twice. Claiming
 * the hands here, synchronously, before anything is awaited, is what makes that
 * impossible.
 */
const inFlight = new Map<string, Promise<void>>()

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
  const running = [
    ...new Set(hands.map(h => inFlight.get(h.id)).filter((p): p is Promise<void> => p != null)),
  ]

  if (missing.length > 0) {
    const pass = (async () => {
      const { data } = await collectAllInDataAsync(missing, onProgress)
      for (const d of data) cache.set(d.handId, d)
    })()

    // Claimed before `pass` yields, so a caller arriving later sees these as taken. A
    // hand with no equity to compute (not an all-in) simply never lands in the cache;
    // it is dropped from the result below, which is the same thing.
    for (const h of missing) inFlight.set(h.id, pass)

    const release = () => {
      for (const h of missing) {
        if (inFlight.get(h.id) === pass) inFlight.delete(h.id)
      }
    }
    // Released on failure too, so a transient error leaves the hands retryable instead of
    // claimed forever by a pass that will never finish. The caller still sees the
    // rejection, through the await below.
    pass.then(release, release)
    running.push(pass)
  }

  await Promise.all(running)

  return hands.map(h => cache.get(h.id)).filter((d): d is AllInHandData => d !== undefined)
}

/** Test seam. Without it, module state would leak between test cases. */
export function resetEquityStore(): void {
  cache.clear()
  inFlight.clear()
}
