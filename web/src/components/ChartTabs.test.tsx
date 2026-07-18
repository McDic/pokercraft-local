// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChartTabs } from './ChartTabs'

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

function tabByLabel(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(b =>
    b.textContent?.includes(label)
  ) as HTMLButtonElement | undefined
}

function render(tournamentCount: number, handHistoryCount: number) {
  act(() => {
    root.render(
      <ChartTabs
        activeTab="handHistory"
        onTabChange={() => {}}
        tournamentCount={tournamentCount}
        handHistoryCount={handHistoryCount}
      />
    )
  })
}

describe('ChartTabs — disabled-tab tooltips', () => {
  it('explains every disabled tab, per its missing data', () => {
    render(0, 5) // hand histories only
    const tournament = tabByLabel('Tournament Summary')!
    // Disabled via aria-disabled (not the `disabled` attribute), so it stays focusable for AT.
    expect(tournament.getAttribute('aria-disabled')).toBe('true')
    expect(tournament.getAttribute('data-tooltip')).toBe('Needs tournament results')
    // The reason is also exposed to assistive tech via aria-label.
    expect(tournament.getAttribute('aria-label')).toContain('Needs tournament results')
    expect(tabByLabel('Deep Dive')!.getAttribute('data-tooltip')).toBe(
      'Needs both tournament results and hand histories'
    )
  })

  it('explains the hand-history-dependent tabs when only tournaments are present', () => {
    render(3, 0) // tournaments only
    expect(tabByLabel('Hand History')!.getAttribute('data-tooltip')).toBe('Needs hand history data')
    // The situation tab shares the hand-history requirement.
    expect(tabByLabel('Preflop Situations')!.getAttribute('data-tooltip')).toBe(
      'Needs hand history data'
    )
  })

  it('gives an enabled tab no tooltip', () => {
    render(3, 5) // both present
    const deepDive = tabByLabel('Deep Dive')!
    expect(deepDive.getAttribute('aria-disabled')).toBeNull()
    expect(deepDive.getAttribute('data-tooltip')).toBeNull()
  })
})
