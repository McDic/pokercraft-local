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
  return {
    calls,
    fn: vi.fn(async (hands: HandHistory[]) => {
      calls.push(hands.map(h => h.id))
      await new Promise<void>(resolve => pending.push(resolve))
      return {
        data: hands.map(h => ({
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
    },
  }
})

vi.mock('./allInEquityAsync', async importOriginal => {
  const actual = await importOriginal<typeof import('./allInEquityAsync')>()
  return { ...actual, collectAllInDataAsync: collect.fn }
})

const { loadEquity, resetEquityStore } = await import('./equityStore')

const hand = (id: string) => ({ id }) as HandHistory

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
    collect.finish()
    expect(await load).toHaveLength(2)
    expect(collect.calls).toEqual([['a', 'b']])

    // Second call: everything is cached, so nothing is computed again.
    expect(await loadEquity([hand('a'), hand('b')])).toHaveLength(2)
    expect(collect.calls).toEqual([['a', 'b']])
  })

  // The bug this store exists for. The cache is only written once a whole batch resolves,
  // so a second upload landing mid-pass used to see every in-flight hand as uncached and
  // start a *second* pool of up to 8 unabortable workers on hands the first pool was
  // already grinding — both pools then fighting for the CPU over the same WASM.
  it('does not recompute hands that an in-flight pass is already working on', async () => {
    const first = loadEquity([hand('a'), hand('b')])

    // A second upload lands: the same two hands, plus a new one.
    const second = loadEquity([hand('a'), hand('b'), hand('c')])

    // Only 'c' is handed to a new pass. 'a' and 'b' are awaited, not redone.
    expect(collect.calls).toEqual([
      ['a', 'b'],
      ['c'],
    ])

    collect.finish() // first pass
    collect.finish() // the pass for 'c'

    expect(await first).toHaveLength(2)
    expect(await second).toHaveLength(3)
    // Still exactly two passes: no hand was computed twice.
    expect(collect.calls).toEqual([
      ['a', 'b'],
      ['c'],
    ])
  })

  it('waits for an in-flight pass rather than returning a hand as missing', async () => {
    const first = loadEquity([hand('a')])
    const second = loadEquity([hand('a')]) // identical, while the first is still running

    expect(collect.calls).toEqual([['a']]) // one pass, not two

    collect.finish()
    expect(await first).toHaveLength(1)
    expect(await second).toHaveLength(1) // resolved from the pass it waited on
  })

  // Otherwise a transient failure would leave the hands claimed forever, and every later
  // attempt would await a promise that already rejected.
  it('releases its claim when a pass fails, so the hands can be retried', async () => {
    collect.fn.mockRejectedValueOnce(new Error('WASM exploded'))
    await expect(loadEquity([hand('a')])).rejects.toThrow('WASM exploded')

    // The retry actually recomputes rather than hanging on the dead claim.
    const retry = loadEquity([hand('a')])
    collect.finish()
    expect(await retry).toHaveLength(1)
  })
})
