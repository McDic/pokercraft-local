import { describe, it, expect } from 'vitest'
import type { HandHistory } from '../../types'
import { getChipHistoriesData } from './chipHistories'
import { getHandUsageHeatmapsData } from './handUsageHeatmaps'
import { identityT } from '../../test/i18n'

// Helper to create a minimal hand history for testing
function createMockHandHistory(overrides: Partial<HandHistory> = {}): HandHistory {
  const baseHH: HandHistory = {
    id: 'TM00001',
    tournamentId: 1,
    tournamentName: 'Test Tournament',
    level: 1,
    sb: 10,
    bb: 20,
    datetime: new Date('2024-01-01T12:00:00'),
    buttonSeat: 1,
    sbSeat: 2,
    bbSeat: 3,
    maxSeats: 6,
    tableId: '1',
    seats: new Map([
      [1, ['Player1', 1000]],
      [2, ['Player2', 1000]],
      [3, ['Hero', 1000]],
    ]),
    knownCards: new Map([
      ['Hero', ['As', 'Kh']],
    ]),
    wons: new Map(),
    communityCards: [],
    actionsPreflop: [],
    actionsFlop: [],
    actionsTurn: [],
    actionsRiver: [],
    uncalledReturned: null,
    allIned: new Map(),
  }

  return { ...baseHH, ...overrides }
}

describe('chipHistories', () => {
  it('should return only danger line for empty input', async () => {
    const result = await getChipHistoriesData([], identityT)
    // Should only have the danger line trace when no data
    expect(result.traces.length).toBeLessThanOrEqual(1)
  })

  it('should generate traces for hand histories', async () => {
    const hh1 = createMockHandHistory({
      id: 'TM00001',
      wons: new Map([['Hero', 50]]),
    })
    hh1.actionsPreflop = [
      { playerId: 'Hero', action: 'blind', amount: 20, isAllIn: false },
      { playerId: 'Hero', action: 'raise', amount: 50, isAllIn: false },
    ]

    const hh2 = createMockHandHistory({
      id: 'TM00002',
      datetime: new Date('2024-01-01T12:30:00'),
      wons: new Map([['Hero', 100]]),
    })
    hh2.actionsPreflop = [
      { playerId: 'Hero', action: 'blind', amount: 20, isAllIn: false },
      { playerId: 'Hero', action: 'call', amount: 30, isAllIn: false },
    ]

    const result = await getChipHistoriesData([hh1, hh2], identityT)
    // Should have at least the chip history line + danger line
    expect(result.traces.length).toBeGreaterThan(0)
    expect(result.layout.title).toEqual({ text: 'chart.chipHistories.title' })
  })

  // The per-tournament chip lines are a WebGL trace (`scattergl`) — ~943 lines / ~76k points on
  // real data, the only heavy trace here. The danger line, survival curve, and death-threshold bar
  // stay non-gl: one trace each, the survival curve needs `fill` (gl's weak spot), and as SVG they
  // paint above the WebGL layer so the danger line and overlays stay on top. The overlays all share
  // `mode:'lines'` with the chip lines, so they're identified by name, not mode.
  it('uses WebGL only for the per-tournament chip lines, SVG for the overlays', async () => {
    const hh1 = createMockHandHistory({ id: 'TM00001', tournamentId: 1, wons: new Map([['Hero', 50]]) })
    const hh2 = createMockHandHistory({ id: 'TM00002', tournamentId: 2, wons: new Map([['Hero', 100]]) })

    const { traces } = await getChipHistoriesData([hh1, hh2], identityT)
    const typeOf = (name: string) =>
      (traces.find(tr => (tr as { name?: string }).name === name) as { type?: string } | undefined)
        ?.type

    // Every gl trace is a per-tournament chip line (mode 'lines'), and there is at least one.
    const gl = traces.filter(tr => (tr as { type?: string }).type === 'scattergl')
    expect(gl.length).toBeGreaterThan(0)
    for (const tr of gl) expect((tr as { mode?: string }).mode).toBe('lines')

    // The overlays stay off the WebGL layer.
    expect(typeOf('chart.chipHistories.legend.dangerLine')).toBe('scatter')
    expect(typeOf('chart.chipHistories.legend.survivalRate')).toBe('scatter')
    expect(typeOf('chart.chipHistories.legend.deathThreshold')).toBe('bar')
  })
})

describe('handUsageHeatmaps', () => {
  it('should return empty traces for empty input', async () => {
    const result = await getHandUsageHeatmapsData([], identityT)
    // Even with empty input, we still generate the 9 heatmaps (just with no data)
    expect(result.traces).toHaveLength(9)
  })

  it('should generate heatmaps with hand data', async () => {
    const hh = createMockHandHistory()
    hh.actionsPreflop = [
      { playerId: 'Hero', action: 'blind', amount: 20, isAllIn: false },
      { playerId: 'Hero', action: 'raise', amount: 60, isAllIn: false },
    ]

    const result = await getHandUsageHeatmapsData([hh], identityT)
    expect(result.traces).toHaveLength(9) // 8 positions + all
    expect(result.layout.title).toEqual({ text: 'chart.handUsage.title' })
  })
})

// Note: allInEquity tests require WASM initialization which isn't available in unit tests.
// The functionality is tested through integration tests.
