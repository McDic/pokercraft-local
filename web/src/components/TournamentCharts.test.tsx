// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TournamentCharts } from './TournamentCharts'
import { makeTournament, makeBankrollResults } from '../test/fixtures'
import type { TournamentSummary } from '../types'
import type { BankrollWorkerResult } from '../workers/analysisWorker'

// Plotly needs a real browser; the chart *data* is what we assert on.
vi.mock('./plot', () => ({ default: () => null }))

const viz = vi.hoisted(() => {
  const empty = () => ({ traces: [], layout: {}, caption: [] })
  return {
    getHistoricalPerformanceData: vi.fn(empty),
    getRREHeatmapData: vi.fn(empty),
    getPrizePiesData: vi.fn(empty),
    getRRByRankData: vi.fn(empty),
    getBankrollAnalysisData: vi.fn(empty),
  }
})
vi.mock('../visualization', () => viz)

// Chart generation parks on yieldToBrowser() between charts. Turning each yield
// into a gate we open by hand makes the interleaving of two concurrent
// generations exact, instead of racing real timers.
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

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

async function render(tournaments: TournamentSummary[], bankrollResults: BankrollWorkerResult[]) {
  await act(async () => {
    root.render(<TournamentCharts tournaments={tournaments} bankrollResults={bankrollResults} />)
  })
}

/** The component shows its progress bar for as long as it is generating charts. */
function isComputing(): boolean {
  return container.querySelector('.chart-loading') !== null
}

/** Let every parked generation advance to its next yield. */
async function step() {
  await act(async () => {
    gates.open()
    // The component pulls in ../visualization with a dynamic import, which
    // settles on a macrotask rather than on a gate.
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

/** Run generations to completion. Bounded so a stall fails instead of hanging. */
async function drain(maxSteps = 100) {
  for (let i = 0; i < maxSteps && isComputing(); i++) {
    await step()
  }
  if (isComputing()) throw new Error('chart generation did not finish')
}

describe('TournamentCharts', () => {
  // Regression: the bankroll simulation runs in the analysis worker and lands
  // *after* the parsed tournaments, so a second upload redraws the charts with
  // the previous run's bankroll results and then gets the fresh ones. Those two
  // result sets always have the same length, so the component must not decide
  // "nothing changed" from counts alone.
  it('redraws the bankroll chart when a later simulation replaces the previous one', async () => {
    const firstUpload = [makeTournament(1), makeTournament(2)]
    const firstSim = makeBankrollResults(0.5)

    await render(firstUpload, firstSim)
    await drain()
    expect(viz.getBankrollAnalysisData).toHaveBeenCalledWith(firstSim, expect.any(Function))

    // Second upload: more tournaments, simulation for them still running.
    const secondUpload = [...firstUpload, makeTournament(3)]
    await render(secondUpload, firstSim)
    await drain()

    // The new simulation lands — same shape, different numbers.
    const secondSim = makeBankrollResults(0.1)
    await render(secondUpload, secondSim)
    await drain()

    expect(viz.getBankrollAnalysisData).toHaveBeenLastCalledWith(secondSim, expect.any(Function))
  })

  // Regression: a superseded generation must not report "Complete". It captured
  // the old props, so letting it clear the progress bar would also drop the
  // export's still-calculating guard while the newest charts are still missing.
  it('keeps reporting progress when a superseded generation finishes late', async () => {
    const tournaments = [makeTournament(1)]

    // First upload: the charts are generated while the bankroll simulation is
    // still running in the worker, so there are no results to draw yet. Advance
    // that generation to its last chart, where only the final yield is left.
    await render(tournaments, [])
    for (let i = 0; i < 20 && viz.getRRByRankData.mock.calls.length === 0; i++) {
      await step()
    }
    expect(viz.getRRByRankData).toHaveBeenCalled()
    expect(isComputing()).toBe(true)

    // The simulation lands, superseding that nearly-finished generation.
    const sim = makeBankrollResults(0.5)
    await render(tournaments, sim)
    expect(isComputing()).toBe(true)

    // The superseded generation now runs off the end of its work.
    await step()

    expect(viz.getBankrollAnalysisData).not.toHaveBeenCalled()
    expect(isComputing(), 'progress bar cleared while the newest charts were still missing').toBe(
      true
    )

    await drain()
    expect(viz.getBankrollAnalysisData).toHaveBeenCalledWith(sim, expect.any(Function))
    expect(isComputing()).toBe(false)
  })

  it('shows the bankroll-simulation progress below the charts while analyzing', async () => {
    // While analyzing, the sim message takes priority over any chart-generation message.
    await act(async () => {
      root.render(
        <TournamentCharts
          tournaments={[makeTournament(1)]}
          bankrollResults={[]}
          isAnalyzing={true}
          analyzeProgress={{
            stage: 'bankroll',
            current: 0,
            total: 1,
            messageKey: 'progress.bankroll',
            messageParams: { capital: 10 },
            percentage: 40,
          }}
        />
      )
    })
    const loading = container.querySelector('.chart-loading')
    expect(loading).not.toBeNull()
    // The real "Simulating N buy-ins" message (with its interpolated number), not a generic label.
    expect(loading!.textContent).toContain('10')
  })
})
