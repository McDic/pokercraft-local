import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { HandHistory } from '../../types'

// `loadEquity` is the deduplicating layer over this. Standing in for it lets a test hold
// a "pass" open and start a second one while the first is still running — which is the
// race the store exists to close, and which real Web Workers make impossible to arrange.
const collect = vi.hoisted(() => {
  const calls: string[][] = []
  // A queue, not a single slot: the whole point of these tests is two passes being in
  // flight at once, and a single slot would have the second clobber the first.
  const pending: Array<() => void> = []
  const progress: Array<((c: number, t: number) => void) | undefined> = []
  return {
    calls,
    /** Drive the progress callback of the oldest pass still in flight. */
    report(current: number, total: number) {
      progress[0]?.(current, total)
    },
    fn: vi.fn(async (hands: HandHistory[], onProgress?: (c: number, t: number) => void) => {
      calls.push(hands.map(h => h.id))
      // Faithful to the real thing: only all-in hands yield a result. A mock that
      // returned data for everything would hide the fact that a hand which never had an
      // all-in is never cached, and so is offered again on every call.
      const eligible = hands.filter(h => h.id.startsWith('allin'))
      if (eligible.length === 0) return { data: [] }
      progress.push(onProgress)
      await new Promise<void>(resolve => pending.push(resolve))
      return {
        data: eligible.map(h => ({
          handId: h.id,
          equity: 0.5,
          actualResult: 1,
          allInStreet: 'preflop',
        })),
      }
    }),
    /** Let the oldest pass still in flight finish. */
    finish() {
      const resolve = pending.shift()
      if (!resolve) throw new Error('no pass in flight')
      resolve()
    },
    reset() {
      calls.length = 0
      pending.length = 0
      progress.length = 0
    },
  }
})

vi.mock('./allInEquityAsync', async importOriginal => {
  const actual = await importOriginal<typeof import('./allInEquityAsync')>()
  return { ...actual, collectAllInDataAsync: collect.fn }
})

const { loadEquity, resetEquityStore } = await import('./equityStore')

/** An all-in hand — the kind that actually produces equity. */
const hand = (id: string) => ({ id: `allin-${id}` }) as HandHistory

/** A hand with no all-in, which never yields a result and so is never cached. */
const fold = (id: string) => ({ id: `fold-${id}` }) as HandHistory

/**
 * Let deferred passes actually start.
 *
 * `loadEquity` claims its hands synchronously and only *then* lets the pass run, on a
 * microtask — so that the claim is unconditionally first, rather than first by accident
 * of how much `collectAllInDataAsync` happens to do before its own first await.
 */
const tick = () => Promise.resolve()

beforeEach(() => {
  resetEquityStore()
  collect.reset()
  vi.clearAllMocks()
})

afterEach(() => {
  resetEquityStore()
})

describe('loadEquity', () => {
  it('computes the hands it is given, and caches them', async () => {
    const load = loadEquity([hand('a'), hand('b')])
    await tick()
    collect.finish()
    expect(await load).toHaveLength(2)
    expect(collect.calls).toEqual([['allin-a', 'allin-b']])

    // Second call: everything is cached, so nothing is computed again.
    expect(await loadEquity([hand('a'), hand('b')])).toHaveLength(2)
    expect(collect.calls).toEqual([['allin-a', 'allin-b']])
  })

  // The bug this store exists for. The cache is only written once a whole batch resolves,
  // so a second upload landing mid-pass used to see every in-flight hand as uncached and
  // start a *second* pool of up to 8 unabortable workers on hands the first pool was
  // already grinding — both pools then fighting for the CPU over the same WASM.
  it('does not recompute hands that an in-flight pass is already working on', async () => {
    const first = loadEquity([hand('a'), hand('b')])

    // A second upload lands, mid-pass: the same two hands, plus a new one. The claims are
    // already in place, even though neither pass has begun running.
    const second = loadEquity([hand('a'), hand('b'), hand('c')])
    await tick()

    // Only 'c' is handed to a new pass. 'a' and 'b' are awaited, not redone.
    expect(collect.calls).toEqual([
      ['allin-a', 'allin-b'],
      ['allin-c'],
    ])

    collect.finish() // first pass
    collect.finish() // the pass for 'c'

    expect(await first).toHaveLength(2)
    expect(await second).toHaveLength(3)
    // Still exactly two passes: no hand was computed twice.
    expect(collect.calls).toEqual([
      ['allin-a', 'allin-b'],
      ['allin-c'],
    ])
  })

  it('waits for an in-flight pass rather than returning a hand as missing', async () => {
    const first = loadEquity([hand('a')])
    const second = loadEquity([hand('a')]) // identical, while the first is still running
    await tick()

    expect(collect.calls).toEqual([['allin-a']]) // one pass, not two

    collect.finish()
    expect(await first).toHaveLength(1)
    expect(await second).toHaveLength(1) // resolved from the pass it waited on
  })

  // Reported progress must cover every pass the caller is waiting on, not just the one it
  // started. Otherwise a caller that joined someone else's pass would show a bar frozen on
  // its own completed count while the pass holding the hands it needs ground on invisibly.
  it('reports progress across every pass it is waiting on, not just its own', async () => {
    const seen: Array<[number, number]> = []

    const first = loadEquity([hand('a'), hand('b')])
    await tick()

    // A second call joins that pass and adds one new hand of its own.
    const second = loadEquity([hand('a'), hand('b'), hand('c')], (c, t) => seen.push([c, t]))
    await tick()

    // The joined pass moves. The joiner hears about it, even though it did not start it.
    collect.report(1, 2)
    expect(seen.at(-1)).toEqual([1, 2])

    collect.finish()
    collect.finish()
    await Promise.all([first, second])
  })

  // Hands that never had an all-in produce no result and so are never cached — they are
  // re-offered on every call. That must cost nothing, and must not wedge anything.
  it('re-offers hands with no all-in without spawning work for them', async () => {
    const load = loadEquity([hand('a'), fold('x')])
    await tick()
    collect.finish()
    expect(await load).toHaveLength(1) // only the all-in yields equity

    // Second call: the all-in is cached, so only the fold is offered — and it needs no
    // worker, so this resolves without anything having to be finished.
    expect(await loadEquity([hand('a'), fold('x')])).toHaveLength(1)
    expect(collect.calls).toEqual([['allin-a', 'fold-x'], ['fold-x']])
  })

  // Otherwise a transient failure would leave the hands claimed forever, and every later
  // attempt would await a promise that already rejected.
  it('releases its claim when a pass fails, so the hands can be retried', async () => {
    collect.fn.mockRejectedValueOnce(new Error('WASM exploded'))
    await expect(loadEquity([hand('a')])).rejects.toThrow('WASM exploded')

    // The retry actually recomputes rather than hanging on the dead claim.
    const retry = loadEquity([hand('a')])
    await tick()
    collect.finish()
    expect(await retry).toHaveLength(1)
  })
})
