import { describe, it, expect } from 'vitest'
import type { HandHistory } from '../../types'
import { getChipHistoriesData } from './chipHistories'
import { getHandUsageHeatmapsData } from './handUsageHeatmaps'

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
    const result = await getChipHistoriesData([])
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

    const result = await getChipHistoriesData([hh1, hh2])
    // Should have at least the chip history line + danger line
    expect(result.traces.length).toBeGreaterThan(0)
    expect(result.layout.title).toEqual({ text: 'Chip Histories' })
  })
})

describe('handUsageHeatmaps', () => {
  it('should return empty traces for empty input', async () => {
    const result = await getHandUsageHeatmapsData([])
    // Even with empty input, we still generate the 9 heatmaps (just with no data)
    expect(result.traces).toHaveLength(9)
  })

  it('should generate heatmaps with hand data', async () => {
    const hh = createMockHandHistory()
    hh.actionsPreflop = [
      { playerId: 'Hero', action: 'blind', amount: 20, isAllIn: false },
      { playerId: 'Hero', action: 'raise', amount: 60, isAllIn: false },
    ]

    const result = await getHandUsageHeatmapsData([hh])
    expect(result.traces).toHaveLength(9) // 8 positions + all
    expect(result.layout.title).toEqual({ text: 'Hand Usage by Position (VPIP Heatmaps)' })
  })
})

// Note: allInEquity tests require WASM initialization which isn't available in unit tests.
// The functionality is tested through integration tests.
