// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createRef, type RefObject } from 'react'
import { HandHistoryCharts, type HandHistoryChartsRef } from './HandHistoryCharts'
import type { HandHistory } from '../types'
import i18n from '../i18n'

// The component renders through the real translator (test/setup.ts pins it to English),
// so chart names arrive translated. Resolve the keys the same way rather than hardcoding
// the English, so a wording change does not break these tests.
const NAME = {
  chips: i18n.t('chart.chipHistories.name'),
  usage: i18n.t('chart.handUsage.name'),
  equity: i18n.t('chart.allInEquity.name'),
}

// Plotly needs a real browser; the chart *data* is what we assert on.
vi.mock('./plot', () => ({ default: () => null }))

const viz = vi.hoisted(() => {
  const chart = () => ({ traces: [{}], layout: {} })
  return {
    getChipHistoriesData: vi.fn(async () => chart()),
    getHandUsageHeatmapsData: vi.fn(async () => chart()),
  }
})
vi.mock('../visualization', () => viz)

// The equity pass is gated by hand, so a test can hold it open across the exact commit
// where the component hands off from the data layer to the chart layer.
const equity = vi.hoisted(() => {
  let release: ((data: Array<{ handId: string }>) => void) | null = null
  return {
    loadEquity: vi.fn(
      () => new Promise(resolve => {
        release = data => resolve(data)
      })
    ),
    calculateLuckScore: vi.fn(async () => 1.5),
    createAllInEquityChart: vi.fn(() => ({ traces: [{}], layout: {} })),
    /** Resolve the pass currently in flight. Throws if none is — which is the point:
     *  a test that finishes a pass that never started would otherwise silently resolve
     *  the *previous* test's promise, since this mock outlives the test. */
    finish(data: Array<{ handId: string }>) {
      if (!release) throw new Error('no equity pass is in flight')
      const resolve = release
      release = null
      resolve(data)
    },
    reset: () => {
      release = null
    },
    inFlight: () => release !== null,
  }
})
vi.mock('../visualization/handHistory/equityStore', () => ({ loadEquity: equity.loadEquity }))
vi.mock('../visualization/handHistory/allInEquityAsync', () => ({
  calculateLuckScore: equity.calculateLuckScore,
  createAllInEquityChart: equity.createAllInEquityChart,
}))

const gates = vi.hoisted(() => {
  let waiting: Array<() => void> = []
  return {
    yieldToBrowser: vi.fn(() => new Promise<void>(resolve => waiting.push(resolve))),
    open: () => {
      const opening = waiting
      waiting = []
      opening.forEach(resolve => resolve())
    },
  }
})
vi.mock('../utils', () => ({ yieldToBrowser: gates.yieldToBrowser }))

let container: HTMLDivElement
let root: Root
let ref: RefObject<HandHistoryChartsRef | null>

let idSeq = 0
/** Fresh ids per test, so nothing can accidentally depend on another test's hands. */
function makeHands(count: number): HandHistory[] {
  const batch = ++idSeq
  return Array.from({ length: count }, (_, i) => ({ id: `t${batch}-h${i}` }) as HandHistory)
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  ref = createRef<HandHistoryChartsRef>()
  equity.reset()
})

afterEach(async () => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
  // i18n is a module-global singleton, so a test that switches language must put it back.
  await i18n.changeLanguage('en')
})

async function render(handHistories: HandHistory[]) {
  await act(async () => {
    root.render(<HandHistoryCharts ref={ref} handHistories={handHistories} />)
  })
}

/** Let every parked async step advance to its next yield. */
async function step() {
  await act(async () => {
    gates.open()
    // The component pulls its chart modules in with a dynamic import, which settles on
    // a macrotask rather than on a gate.
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

/** Advance until the equity pass has actually started and is parked, awaiting results. */
async function stepUntilEquityInFlight(maxSteps = 20) {
  for (let i = 0; i < maxSteps && !equity.inFlight(); i++) {
    await step()
  }
  if (!equity.inFlight()) throw new Error('equity pass never started')
}

/** Release the in-flight equity pass with one all-in hand's worth of results. */
async function landEquity() {
  await act(async () => {
    equity.finish([{ handId: 'allin-1' }])
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function drain(maxSteps = 40) {
  for (let i = 0; i < maxSteps && ref.current?.isComputing(); i++) {
    await step()
  }
}

const chartNames = () => ref.current!.getChartData().map(c => c.name)
const isIdle = () => !ref.current!.isComputing()

describe('HandHistoryCharts', () => {
  // The headline of the whole i18n change: relabelling must never touch the data layer.
  // `collectAllInDataAsync` spawns Web Workers that cannot be aborted, so re-running it
  // for a language switch would leave one pool alive while starting another.
  //
  // Note on what is NOT covered here: `isComputing` is derived from state rather than
  // tracked as a flag per effect, so it cannot read "idle" for the one commit between a
  // layer finishing and the next starting — which is what let an export slip out with
  // the all-in equity chart silently missing. That window is a single render, and
  // `act()` flushes React's passive effects synchronously, so no test in this harness
  // can observe it. It is closed by construction, not by assertion.
  it('rebuilds every figure on a language switch without recomputing equity', async () => {
    await render(makeHands(3))
    await stepUntilEquityInFlight()
    await landEquity()
    await drain()

    expect(isIdle()).toBe(true)
    expect(equity.loadEquity).toHaveBeenCalledTimes(1)

    await act(async () => {
      await i18n.changeLanguage('ko')
    })

    // Every figure is stale the instant the language changes — no window in which the
    // export gate could read "idle" while Korean charts are still English.
    expect(isIdle()).toBe(false)

    await drain()

    expect(isIdle()).toBe(true)
    // The expensive pass ran once, for the upload. The switch did not touch it.
    expect(equity.loadEquity).toHaveBeenCalledTimes(1)
    // All three figures were rebuilt in the new language.
    expect(viz.getChipHistoriesData).toHaveBeenCalledTimes(2)
    expect(viz.getHandUsageHeatmapsData).toHaveBeenCalledTimes(2)
    expect(equity.createAllInEquityChart).toHaveBeenCalledTimes(2)
    expect(chartNames()).toEqual([
      i18n.t('chart.chipHistories.name'),
      i18n.t('chart.handUsage.name'),
      i18n.t('chart.allInEquity.name'),
    ])
  })

  // Regression: chip histories and hand usage do not depend on the equity data, but they
  // used to live in an effect that had it as a dependency — so every equity result threw
  // them away and rebuilt them. getHandUsageHeatmapsData is the expensive one.
  it('builds each hand-derived figure exactly once per upload', async () => {
    await render(makeHands(3))
    await stepUntilEquityInFlight()
    await landEquity()
    await drain()

    expect(viz.getChipHistoriesData).toHaveBeenCalledTimes(1)
    expect(viz.getHandUsageHeatmapsData).toHaveBeenCalledTimes(1)
    expect(chartNames()).toEqual([NAME.chips, NAME.usage, NAME.equity])
  })

  // A failure has to be shown — writing it into the progress state, as the component used
  // to, meant the very act of reporting it unmounted the block that displayed it. And it
  // has to be *dropped* once the layer that raised it recovers: the figure layers rerun
  // on every language switch, so a banner that outlived its cause would be permanent.
  it('shows a failure, and clears it when that layer succeeds again', async () => {
    viz.getChipHistoriesData.mockRejectedValueOnce(new Error('boom'))

    await render(makeHands(3))
    await stepUntilEquityInFlight()
    await landEquity()
    await drain()

    const banner = () => container.querySelector('.chart-error')?.textContent ?? null
    expect(banner()).toBe(i18n.t('charts.buildFailed'))
    // The failure is confined to its own layer: the equity chart still made it.
    expect(chartNames()).toContain(NAME.equity)

    // A language switch reruns the figure layers. This time they succeed.
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
    await drain()

    expect(banner(), 'the banner outlived the failure that caused it').toBeNull()
    expect(chartNames()).toHaveLength(3)
  })

  it('settles with every figure present, and reports idle', async () => {
    await render(makeHands(2))
    await stepUntilEquityInFlight()
    await landEquity()
    await drain()

    expect(isIdle()).toBe(true)
    expect(chartNames()).toHaveLength(3)
    expect(container.querySelector('.chart-loading')).toBeNull()
  })
})
