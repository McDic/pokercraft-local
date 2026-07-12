// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TournamentCharts } from './TournamentCharts'
import type { TournamentSummary } from '../types'
import type { BankrollWorkerResult } from '../workers/analysisWorker'

// Plotly needs a real browser; the charts' data is what we assert on.
vi.mock('./plot', () => ({ default: () => null }))

const viz = vi.hoisted(() => {
  const empty = () => ({ traces: [], layout: {} })
  return {
    getHistoricalPerformanceData: vi.fn(empty),
    getRREHeatmapData: vi.fn(empty),
    getPrizePiesData: vi.fn(empty),
    getRRByRankData: vi.fn(empty),
    getBankrollAnalysisData: vi.fn(empty),
  }
})
vi.mock('../visualization', () => viz)

function tournament(id: number): TournamentSummary {
  return {
    id,
    name: `T${id}`,
    buyInPure: 0.9,
    rake: 0.1,
    totalPrizePool: 100,
    startTime: new Date(2026, 0, id),
    myRank: 1,
    totalPlayers: 100,
    myPrize: 5,
    myEntries: 1,
  }
}

/** One result per initial capital — the length never varies, only the rates do. */
function bankroll(bankruptcyRate: number): BankrollWorkerResult[] {
  return [10, 20, 50, 100, 200, 500].map(initialCapital => ({
    initialCapital,
    bankruptcyRate,
    survivalRate: 1 - bankruptcyRate,
  }))
}

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

/** The chart generation yields to the browser between charts, so let it drain. */
async function settle(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let pending = false
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      pending = container.querySelector('.chart-loading') !== null
    })
    if (!pending) return
  }
  throw new Error('chart generation did not finish')
}

describe('TournamentCharts', () => {
  // Regression: the bankroll simulation runs in the analysis worker and lands
  // *after* the parsed tournaments, so a second upload redraws the charts with
  // the previous run's bankroll results and then gets the fresh ones. Those two
  // result sets always have the same length, so the component must not decide
  // "nothing changed" from counts alone.
  it('redraws the bankroll chart when a later simulation replaces the previous one', async () => {
    const firstUpload = [tournament(1), tournament(2)]
    const firstSim = bankroll(0.5)

    await render(firstUpload, firstSim)
    await settle()
    expect(viz.getBankrollAnalysisData).toHaveBeenCalledWith(firstSim)

    // Second upload: more tournaments, simulation for them still running.
    const secondUpload = [...firstUpload, tournament(3)]
    await render(secondUpload, firstSim)
    await settle()

    // The new simulation lands — same shape, different numbers.
    const secondSim = bankroll(0.1)
    await render(secondUpload, secondSim)
    await settle()

    expect(viz.getBankrollAnalysisData).toHaveBeenLastCalledWith(secondSim)
  })

  it('does not recompute when re-rendered with unchanged data', async () => {
    const tournaments = [tournament(1)]
    const results = bankroll(0.5)

    await render(tournaments, results)
    await settle()
    const callsAfterFirstRender = viz.getHistoricalPerformanceData.mock.calls.length

    await render(tournaments, results)
    await settle()

    expect(viz.getHistoricalPerformanceData).toHaveBeenCalledTimes(callsAfterFirstRender)
  })
})
