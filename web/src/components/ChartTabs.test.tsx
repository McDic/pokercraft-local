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

function deepDiveButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(b =>
    b.textContent?.includes('Deep Dive')
  ) as HTMLButtonElement | undefined
}

describe('ChartTabs — Deep Dive tab', () => {
  it('is disabled when only one dataset is present', () => {
    act(() => {
      root.render(
        <ChartTabs
          activeTab="handHistory"
          onTabChange={() => {}}
          tournamentCount={0}
          handHistoryCount={5}
        />
      )
    })
    const btn = deepDiveButton()
    expect(btn).toBeDefined()
    expect(btn!.disabled).toBe(true)
  })

  it('is enabled once both datasets are present', () => {
    act(() => {
      root.render(
        <ChartTabs
          activeTab="handHistory"
          onTabChange={() => {}}
          tournamentCount={3}
          handHistoryCount={5}
        />
      )
    })
    const btn = deepDiveButton()
    expect(btn!.disabled).toBe(false)
  })
})
