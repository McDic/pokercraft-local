// @vitest-environment jsdom
/**
 * Coordination tests for the two worker queues.
 *
 * The sibling `useAnalysisWorker.test.ts` covers only the exported merge helpers, which left the
 * queueing itself — the part that decides whether an upload made during a parse is ever parsed —
 * unpinned. These tests drive the hook through a fake Worker so the pump paths are exercised for
 * real: in particular the pump call that happens *inside* a worker `onmessage` callback, which is
 * bound once when the workers are created and must still reach live state on every later message.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createElement, act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useAnalysisWorker, type UseAnalysisWorkerReturn } from './useAnalysisWorker'
import { makeTournament } from '../test/fixtures'

interface PostedMessage {
  type: 'parse' | 'analyze'
  files?: File[]
  allowFreerolls?: boolean
  tournaments?: { id: number }[]
}

class FakeWorker {
  static instances: FakeWorker[] = []
  posted: PostedMessage[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: PostedMessage) {
    this.posted.push(message)
  }

  terminate() {
    this.terminated = true
  }

  /** Deliver a message as the real worker would, from outside React's render pass. */
  emit(data: unknown) {
    act(() => {
      this.onmessage?.({ data } as MessageEvent)
    })
  }
}

let container: HTMLDivElement
let root: Root
const originalWorker = globalThis.Worker

/**
 * Latest hook value, republished after every commit. Captured in an effect rather than assigned
 * during render because writing to an outer binding mid-render is the very impurity these tests
 * exist to guard against — and `react-hooks/globals` rightly rejects it.
 */
const latest: { current: UseAnalysisWorkerReturn | null } = { current: null }
const api = () => {
  if (!latest.current) throw new Error('hook has not committed yet')
  return latest.current
}

function Probe() {
  const value = useAnalysisWorker()
  useEffect(() => {
    latest.current = value
  })
  return null
}

/** The hook creates the parse worker first, then the analyze worker. */
const parseWorker = () => FakeWorker.instances[0]
const analyzeWorker = () => FakeWorker.instances[1]

beforeEach(() => {
  // Opts into React's act() support, which is what makes "an update was not wrapped in act(...)"
  // an actual warning — the net that catches a future helper here forgetting to wrap. Matches
  // TournamentCharts.test.tsx and HandHistoryCharts.test.tsx.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  FakeWorker.instances = []
  // Cleared so the `api()` guard can fire. Left set, a test whose render throws before commit
  // would silently read the previous test's hook — bound to an unmounted root and a dead worker.
  latest.current = null
  globalThis.Worker = FakeWorker as unknown as typeof Worker
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(createElement(Probe)))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  globalThis.Worker = originalWorker
})

const file = (name: string) => new File(['x'], name)

const parseResult = (tournaments: ReturnType<typeof makeTournament>[] = []) => ({
  type: 'result',
  parseResult: { tournaments, handHistories: [], errors: [] },
})

describe('useAnalysisWorker parse queue', () => {
  it('creates both workers up front', () => {
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('posts the first upload straight through', () => {
    act(() => api().parseFiles([file('a.txt')]))

    expect(parseWorker().posted).toHaveLength(1)
    expect(parseWorker().posted[0].type).toBe('parse')
    expect(parseWorker().posted[0].files?.map(f => f.name)).toEqual(['a.txt'])
  })

  it('holds an upload that arrives mid-parse and posts it when the worker frees', () => {
    act(() => api().parseFiles([file('a.txt')]))
    act(() => api().parseFiles([file('b.txt')]))

    // Still busy with the first batch, so the second must not have been posted yet.
    expect(parseWorker().posted).toHaveLength(1)

    // The result frees the worker and the pump — called from inside `onmessage` — drains the queue.
    parseWorker().emit(parseResult())

    expect(parseWorker().posted).toHaveLength(2)
    expect(parseWorker().posted[1].files?.map(f => f.name)).toEqual(['b.txt'])
  })

  it('coalesces several mid-parse uploads into one follow-up batch', () => {
    act(() => api().parseFiles([file('a.txt')]))
    act(() => api().parseFiles([file('b.txt')]))
    act(() => api().parseFiles([file('c.txt')]))

    parseWorker().emit(parseResult())

    expect(parseWorker().posted).toHaveLength(2)
    expect(parseWorker().posted[1].files?.map(f => f.name)).toEqual(['b.txt', 'c.txt'])
  })

  it('applies the last upload\'s freeroll flag to the whole coalesced batch', () => {
    // `parseFiles` overwrites the pending flag rather than tracking it per file, so a batch that
    // merges two uploads carries only the second one's setting. Characterising, not endorsing:
    // it is pre-existing behaviour, and pinning it means a future per-file fix fails loudly here
    // rather than silently changing which hands get filtered.
    act(() => api().parseFiles([file('a.txt')], false))
    act(() => api().parseFiles([file('b.txt')], false))
    act(() => api().parseFiles([file('c.txt')], true))

    expect(parseWorker().posted[0].allowFreerolls).toBe(false)

    parseWorker().emit(parseResult())

    expect(parseWorker().posted[1].files?.map(f => f.name)).toEqual(['b.txt', 'c.txt'])
    expect(parseWorker().posted[1].allowFreerolls).toBe(true)
  })

  it('stops pumping once the queue is empty', () => {
    act(() => api().parseFiles([file('a.txt')]))
    parseWorker().emit(parseResult())
    expect(parseWorker().posted).toHaveLength(1)

    // A second result with nothing queued must not post a phantom parse.
    parseWorker().emit(parseResult())
    expect(parseWorker().posted).toHaveLength(1)
  })

  it('drains the queue after a worker error, so one bad batch does not wedge uploads', () => {
    act(() => api().parseFiles([file('a.txt')]))
    act(() => api().parseFiles([file('b.txt')]))

    act(() => {
      parseWorker().onerror?.({ message: 'boom' })
    })

    expect(parseWorker().posted).toHaveLength(2)
    expect(parseWorker().posted[1].files?.map(f => f.name)).toEqual(['b.txt'])
  })
})

describe('useAnalysisWorker analyze queue', () => {
  /** Analysis only posts once tournaments exist, so seed them through a parse result. */
  function seedTournaments() {
    act(() => api().parseFiles([file('a.txt')]))
    parseWorker().emit(parseResult([makeTournament(1)]))
  }

  it('posts an analysis once tournaments are present', () => {
    seedTournaments()
    act(() => api().runAnalysis())

    expect(analyzeWorker().posted).toHaveLength(1)
    expect(analyzeWorker().posted[0].type).toBe('analyze')
    expect(analyzeWorker().posted[0].tournaments?.map(t => t.id)).toEqual([1])
  })

  it('does not post an analysis when there is nothing to analyse', () => {
    act(() => api().runAnalysis())
    expect(analyzeWorker().posted).toHaveLength(0)
  })

  it('collapses repeated mid-run requests into a single re-run', () => {
    seedTournaments()
    act(() => api().runAnalysis())
    expect(analyzeWorker().posted).toHaveLength(1)

    // Three requests while the sim is in flight collapse to one pending flag...
    act(() => api().runAnalysis())
    act(() => api().runAnalysis())
    act(() => api().runAnalysis())
    expect(analyzeWorker().posted).toHaveLength(1)

    // ...which re-runs exactly once when the current sim reports back.
    analyzeWorker().emit({ type: 'result', bankrollResults: [] })
    expect(analyzeWorker().posted).toHaveLength(2)

    // And with nothing further pending, the next result posts nothing.
    analyzeWorker().emit({ type: 'result', bankrollResults: [] })
    expect(analyzeWorker().posted).toHaveLength(2)
  })

  it('re-runs with the tournaments merged since the sim started, not the ones it began with', () => {
    seedTournaments()
    act(() => api().runAnalysis())
    expect(analyzeWorker().posted[0].tournaments?.map(t => t.id)).toEqual([1])

    // A second upload lands mid-sim and merges into state.
    act(() => api().parseFiles([file('b.txt')]))
    parseWorker().emit(parseResult([makeTournament(2)]))
    act(() => api().runAnalysis())

    analyzeWorker().emit({ type: 'result', bankrollResults: [] })

    expect(analyzeWorker().posted).toHaveLength(2)
    expect(analyzeWorker().posted[1].tournaments?.map(t => t.id)).toEqual([1, 2])
  })
})

describe('useAnalysisWorker teardown', () => {
  it('terminates both workers on unmount', () => {
    const [parse, analyze] = FakeWorker.instances
    act(() => root.unmount())

    try {
      expect(parse.terminated).toBe(true)
      expect(analyze.terminated).toBe(true)
    } finally {
      // Re-mount so the shared afterEach unmount stays harmless. In `finally` so that a real
      // regression here reports once, instead of also tripping the teardown on its way out.
      root = createRoot(container)
      act(() => root.render(createElement(Probe)))
    }
  })
})
