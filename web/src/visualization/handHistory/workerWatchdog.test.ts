/**
 * A worker that dies without a word must not hang the app forever.
 *
 * `collectAllInDataAsync` resolves its per-worker promise on a `message` and rejects on an
 * `error`. A worker killed outright — the browser reclaiming one of eight, each holding a
 * 686 KB cache and a WASM instance, is the realistic way — fires neither. Its promise then
 * never settles, and neither does the `Promise.all` over the pool: no result, no rejection,
 * nothing to catch. The spinner turns for the rest of the session.
 *
 * That is bad on its own, and worse now that the equity store dedupes: every later caller
 * joins the dead pass instead of starting a fresh pool, so what used to self-heal on the
 * next upload is permanent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { HandHistory } from '../../types'
import { makeHandHistory } from '../../test/fixtures'

/** A Worker that accepts work and then says nothing, ever. */
class SilentWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  static spawned = 0
  static terminated = 0
  constructor() {
    SilentWorker.spawned++
  }
  postMessage() {
    /* swallowed — this is the point */
  }
  terminate() {
    SilentWorker.terminated++
  }
}

/** A hand that really is eligible: Hero all-in preflop, both hands shown at showdown. */
const allInHand = (id: string): HandHistory =>
  makeHandHistory(id, {
    seats: new Map([
      [1, ['Hero', 1000]],
      [2, ['villain', 1000]],
    ]),
    knownCards: new Map([
      ['Hero', ['As', 'Kh']],
      ['villain', ['Qs', 'Qd']],
    ]),
    wons: new Map([['Hero', 2000]]),
    allIned: new Map([['Hero', 'preflop']]),
    communityCards: ['2c', '3d', '4h', '5s', '9c'],
  })

beforeEach(() => {
  vi.useFakeTimers()
  SilentWorker.spawned = 0
  SilentWorker.terminated = 0
  vi.stubGlobal('Worker', SilentWorker)
  vi.stubGlobal('navigator', { hardwareConcurrency: 2 })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('collectAllInDataAsync, when a worker dies silently', () => {
  it('gives up on it rather than hanging forever', async () => {
    const { collectAllInDataAsync } = await import('./allInEquityAsync')

    const pass = collectAllInDataAsync([allInHand('h1')])
    // Prove the premise: without the watchdog this promise settles neither way.
    const settled = vi.fn()
    pass.then(settled, settled)

    expect(SilentWorker.spawned).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(settled, 'gave up before the worker was plausibly dead').not.toHaveBeenCalled()

    // Past the silence limit, it is presumed dead.
    await vi.advanceTimersByTimeAsync(40_000)
    await expect(pass).rejects.toThrow(/stopped responding/)
    expect(SilentWorker.terminated, 'the dead worker was left running').toBeGreaterThan(0)
  })

  // The rejection is what lets the store release its claim on those hands — otherwise the
  // dedup would hand every later caller the same never-settling promise.
  it('lets the equity store release its claim, so a retry can re-spawn', async () => {
    const { loadEquity, resetEquityStore } = await import('./equityStore')
    resetEquityStore()

    const first = loadEquity([allInHand('h1')])
    const caught = first.catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(70_000)
    expect(await caught).toMatch(/stopped responding/)

    const spawnedByFirst = SilentWorker.spawned
    // The claim is gone, so this starts a fresh pool rather than joining the dead pass.
    const retry = loadEquity([allInHand('h1')])
    const retryCaught = retry.catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(1)
    expect(SilentWorker.spawned, 'the retry joined the dead pass instead of re-spawning').toBeGreaterThan(
      spawnedByFirst
    )

    await vi.advanceTimersByTimeAsync(70_000)
    expect(await retryCaught).toMatch(/stopped responding/)
    resetEquityStore()
  })
})
