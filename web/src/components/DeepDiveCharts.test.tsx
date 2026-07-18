// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DeepDiveCharts } from './DeepDiveCharts'
import { makeTournament, makeHandHistory } from '../test/fixtures'
import type { HandHistory, TournamentSummary } from '../types'

function ftHand(
  tournamentId: number,
  day: number,
  tableId: string,
  maxSeats: number,
  stacks: Array<[string, number]>
): HandHistory {
  const seats = new Map<number, [string, number]>()
  stacks.forEach((s, i) => seats.set(i + 1, s))
  return makeHandHistory(`TM${tournamentId}-${day}`, {
    tournamentId,
    datetime: new Date(2026, 5, day),
    tableId,
    maxSeats,
    seats,
  })
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(tournaments: TournamentSummary[], handHistories: HandHistory[]) {
  act(() => {
    root.render(<DeepDiveCharts tournaments={tournaments} handHistories={handHistories} />)
  })
}

describe('DeepDiveCharts', () => {
  it('shows the empty state when no final table is found', () => {
    render([], [])
    expect(container.textContent).toContain('No final-table runs')
  })

  it('lists a reached final table with entry state and finish', () => {
    const tournament = makeTournament(100, {
      myRank: 8,
      totalPlayers: 1462,
      name: 'Crazy Eights',
    })
    const nine: Array<[string, number]> = [
      ['Hero', 100], ['a', 200], ['b', 300], ['c', 400],
      ['d', 500], ['e', 600], ['f', 700], ['g', 800], ['h', 900],
    ]
    const hands = [
      ftHand(100, 1, 'A', 8, nine.slice(0, 8)),
      ftHand(100, 2, 'B', 9, nine), // entry hand at the 9-max final table
      ftHand(100, 3, 'B', 9, nine.slice(0, 8)),
    ]
    render([tournament], hands)

    const text = container.textContent ?? ''
    expect(text).toContain('Final Table Runs')
    expect(text).toContain('Crazy Eights')
    expect(text).toContain('9 / 9') // entry rank / seated (Hero shortest of 9)
    expect(text).toContain('8 / 1,462') // finish / entrants
  })

  it('reorders rows when a column header is clicked', () => {
    const nine: Array<[string, number]> = [
      ['Hero', 500], ['a', 100], ['b', 200], ['c', 300],
      ['d', 400], ['e', 600], ['f', 700], ['g', 800], ['h', 900],
    ]
    const alpha = makeTournament(100, {
      myRank: 8,
      totalPlayers: 1000,
      name: 'Alpha',
      startTime: new Date(2026, 0, 1),
    })
    const beta = makeTournament(200, {
      myRank: 3,
      totalPlayers: 500,
      name: 'Beta',
      startTime: new Date(2026, 0, 2),
    })
    render([alpha, beta], [ftHand(100, 1, 'B', 9, nine), ftHand(200, 1, 'B', 9, nine)])

    const firstRow = () => container.querySelector('tbody tr')?.textContent ?? ''
    const clickHeader = (label: string) => {
      const btn = Array.from(container.querySelectorAll('button.sort-header')).find(b =>
        b.textContent?.includes(label)
      ) as HTMLButtonElement
      act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    }

    // Default is date-descending → the newer tournament (Beta) is first.
    expect(firstRow()).toContain('Beta')
    // Tournament column defaults to A→Z → Alpha first.
    clickHeader('Tournament')
    expect(firstRow()).toContain('Alpha')
    // Finish defaults to best-first (ascending) → finish 3 (Beta) ahead of finish 8 (Alpha).
    clickHeader('Finish')
    expect(firstRow()).toContain('Beta')
    // Clicking the active column flips it → worst finish (Alpha, 8th) first.
    clickHeader('Finish')
    expect(firstRow()).toContain('Alpha')
  })
})
