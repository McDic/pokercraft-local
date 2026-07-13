/**
 * The situation charts as they run inside the downloaded file.
 *
 * The aggregation is not re-tested here — there is nothing to re-test, because the runtime
 * imports the same `getSituationLedgerData` and `getHandClassProfitData` the React components
 * call. That is the design, and the test that matters is the one that proves it: the figure
 * the exported file draws must be *identical* to the figure the app drew, having gone through
 * the wire format and back.
 *
 * What is genuinely new in the export, and therefore worth suspicion:
 *
 *   - the pack/unpack round trip the situations take to get there,
 *   - the translator, which is i18next with i18next removed,
 *   - the controls, which re-aggregate on change rather than re-render a React tree.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import i18n from '../i18n'
import en from '../i18n/locales/en.json'
import type { PreflopSituation } from '../analysis/preflopSituation'
import { getSituationLedgerData } from '../visualization/handHistory/situationLedger'
import { getHandClassProfitData, DEFAULT_SCOPE } from '../visualization/handHistory/handClassProfit'
import { DEFAULT_FILTERS } from '../visualization/handHistory/situationFilters'
import { exportableSituations } from './situationPayload'
import { makeTranslator, mount } from './situationRuntime'
import type { SituationExport } from './situationPayload'

const strings = en as Record<string, string>

/**
 * Every Plotly call the runtime makes, in order — and the caption it rendered alongside it.
 *
 * The caption is captured because it is where the *counts* live: `hidden`, `inScope`,
 * `noCards`, `droppedHands`, and the exclusion tallies. Those are precisely the numbers that a
 * wire format dropping 78% of the decisions could disturb without touching a single bar, so a
 * conformance test that compared only `traces` would be blind to the one thing most likely to
 * break. It is read back out of the DOM rather than intercepted, so what is compared is what
 * the reader actually sees.
 */
interface Drawn {
  el: HTMLElement
  traces: unknown[]
  layout: Record<string, unknown>
  caption: string[]
}

let drawn: Drawn[] = []

/** The caption paragraphs of the figure block `el` was plotted into. */
function captionOf(el: HTMLElement): string[] {
  const block = el.closest('section')
  return [...(block?.querySelectorAll('p.chart-caption') ?? [])].map(p => p.textContent ?? '')
}

beforeEach(() => {
  drawn = []
  ;(window as unknown as { Plotly: unknown }).Plotly = {
    react: vi.fn((el: HTMLElement, traces: unknown[], layout: Record<string, unknown>) => {
      drawn.push({ el, traces, layout, caption: captionOf(el) })
      return Promise.resolve()
    }),
    purge: vi.fn(),
  }
})

/** A corpus wide enough that every family and both charts have rows to draw. */
function corpus(): PreflopSituation[] {
  const shapes: Array<[PreflopSituation['context'], PreflopSituation['action']]> = [
    ['unopened', 'raise'],
    ['unopened', 'call'],
    ['limped', 'call'],
    ['raised', 'call'],
    ['raised', 'raise'],
    ['raisedCalled', 'call'],
    ['threeBet', 'call'],
  ]
  const cards: Array<[string, string]> = [
    ['Ah', 'Ad'], ['8h', '8d'], ['Ah', 'Kh'], ['9h', '8h'], ['As', 'Kd'], ['9s', '5d'],
  ]

  // Deep enough that every row still clears the default minimum sample (30) *after* a filter
  // has narrowed it — otherwise the charts come back empty and the assertions below compare
  // one blank figure to another, which is the way a test like this passes while proving
  // nothing.
  const out: PreflopSituation[] = []
  let seed = 7
  for (const [context, action] of shapes) {
    for (const heroOffset of [-1, 0, 1, 2]) {
      for (let i = 0; i < 150; i++) {
        seed = (seed * 1103515245 + 12345) % 2147483648
        out.push({
          context,
          action,
          allIn: false,
          heroOffset,
          openerBucket: i % 2 === 0 ? 'lp' : 'ep',
          raiseToBB: 2.5,
          heroStackBB: i % 3 === 0 ? 12 : 30,
          tableSize: i % 2 === 0 ? 2 : 6,
          deltaBB: (seed / 2147483648 - 0.4) * 9,
          cards: cards[i % cards.length] as [string, string],
        })
      }
    }
  }
  // Folds, which the payload drops. They must not change any number.
  for (const heroOffset of [-1, 0, 1, 2]) {
    out.push({
      context: 'raised', action: 'fold', allIn: false, heroOffset,
      openerBucket: 'lp', raiseToBB: 2.5, heroStackBB: 30, tableSize: 6,
      deltaBB: 0, cards: ['2c', '7d'],
    })
  }
  return out
}

function payload(situations: PreflopSituation[]): SituationExport {
  return {
    rows: exportableSituations(situations),
    filters: DEFAULT_FILTERS,
    scope: DEFAULT_SCOPE,
    strings,
    droppedHands: 0,
  }
}

function selects(root: HTMLElement): HTMLSelectElement[] {
  return [...root.querySelectorAll('select')]
}

function pick(box: HTMLSelectElement, value: string): void {
  box.value = value
  box.dispatchEvent(new Event('change'))
}

describe('makeTranslator', () => {
  it('agrees with i18next on every key it will ever be handed', () => {
    // The exported file has no i18next in it — the strings arrive pre-resolved and all that is
    // left of `t` is placeholder substitution. "All that is left" is a claim, so it is checked
    // against the real thing, over the whole dictionary rather than a sample: any key whose
    // interpolation the shim gets wrong renders a broken sentence in the download and a
    // correct one on screen, which is the hardest kind of bug to be told about.
    // i18next's `t` is typed against the key union, and these keys are only known at runtime;
    // both sides are widened to the same plain signature so the *values* are what is compared.
    type Loose = (key: string, values?: Record<string, unknown>) => string
    const shim = makeTranslator(strings) as unknown as Loose
    const real = i18n.t.bind(i18n) as unknown as Loose

    for (const [key, value] of Object.entries(strings)) {
      const names = [...value.matchAll(/\{\{(\w+)}}/g)].map(m => m[1])
      const values = Object.fromEntries(names.map((name, i) => [name, `v${i}`]))

      expect(shim(key, values), key).toBe(real(key, values))
    }
  })

  it('leaves a placeholder it was given no value for standing', () => {
    // i18next's behaviour, and the useful one: a visible `{{hidden}}` in the caption says
    // something is wrong. "undefined" reads like a number that happens to be missing.
    const t = makeTranslator({ 'chart.situation.ledger.caption.hidden': 'Hidden: {{hidden}}.' })
    expect(t('chart.situation.ledger.caption.hidden', {})).toBe('Hidden: {{hidden}}.')
  })

  it('falls back to the key itself, rather than to nothing', () => {
    expect(makeTranslator({})('chart.situation.empty')).toBe('chart.situation.empty')
  })
})

describe('mount', () => {
  it('draws exactly the figures the app drew, through the wire format', () => {
    // The whole design in one assertion. The app and the export share every line of the
    // aggregation, so the only way they can disagree is if the situations that arrive are not
    // the situations that left — which is precisely what the packing could get wrong, and what
    // no amount of shared code would protect against.
    const situations = corpus()
    const root = document.createElement('div')
    const t = makeTranslator(strings)

    mount(root, payload(situations))

    const ledger = getSituationLedgerData(situations, DEFAULT_FILTERS, t, 0)
    const handClass = getHandClassProfitData(situations, DEFAULT_FILTERS, DEFAULT_SCOPE, t)

    expect(drawn).toHaveLength(2)

    // The bars, the intervals, the colours...
    expect(drawn[0].traces).toEqual(ledger.traces)
    expect(drawn[1].traces).toEqual(handClass.traces)

    // ...and the prose, which is where the counts are. `corpus()` deliberately includes folds,
    // which the payload drops — so if dropping them changed any tally, it would surface right
    // here, in a caption that no longer matches the app's.
    expect(drawn[0].caption).toEqual(ledger.caption)
    expect(drawn[1].caption).toEqual(handClass.caption)
    expect(drawn[0].caption.length).toBeGreaterThan(0) // or the two lines above compare nothing
  })

  it('renders one control per descriptor, and starts on the exported state', () => {
    const root = document.createElement('div')
    mount(root, { ...payload(corpus()), filters: { ...DEFAULT_FILTERS, stackBucket: 'short' } })

    // Four filters, then the class chart's two scope controls.
    expect(selects(root)).toHaveLength(6)
    // The file opens showing the chart that was exported, not a default one.
    expect(selects(root)[1].value).toBe('short')
  })

  it('re-aggregates when a filter changes', () => {
    const situations = corpus()
    const root = document.createElement('div')
    const t = makeTranslator(strings)

    mount(root, payload(situations))
    drawn = []

    pick(selects(root)[2], 'headsUp') // "Players dealt in"

    // Both charts are filtered, so both are redrawn — and with the *narrowed* data, not the
    // data they were mounted with.
    const narrowed = { ...DEFAULT_FILTERS, tableBucket: 'headsUp' as const }
    expect(drawn).toHaveLength(2)
    expect(drawn[0].traces).toEqual(getSituationLedgerData(situations, narrowed, t, 0).traces)
    expect(drawn[0].traces).not.toEqual(
      getSituationLedgerData(situations, DEFAULT_FILTERS, t, 0).traces
    )
  })

  it('leaves the ledger alone when only the scope changes', () => {
    // The ledger does not depend on which row you chose to break down, and rebuilding it would
    // be both wasted work and a visible flicker. The React component is careful about this;
    // the export has to be too, and nothing but a test says so.
    const root = document.createElement('div')
    mount(root, payload(corpus()))
    const ledgerEl = drawn[0].el
    drawn = []

    pick(selects(root)[4], '6') // "Break down which action"

    expect(drawn).toHaveLength(1)
    expect(drawn[0].el).not.toBe(ledgerEl)
  })

  it('shows the empty message, and still shows the caption, when nothing clears the threshold', () => {
    // An empty chart has to say *why* it is empty — "you have done this six times, all below
    // the threshold" is in the caption, and it is the only thing that tells the reader to
    // lower the minimum rather than conclude they never do this.
    const root = document.createElement('div')
    mount(root, { ...payload(corpus()), filters: { ...DEFAULT_FILTERS, minSample: 100000 } })

    expect(drawn).toHaveLength(0)
    expect(root.textContent).toContain(strings['chart.situation.empty'])
    expect(root.textContent).toContain(strings['chart.handClass.caption.reading'])
  })

  it('draws in the language the file was exported in', () => {
    const root = document.createElement('div')
    mount(root, {
      ...payload(corpus()),
      strings: { ...strings, 'chart.situation.filter.stack': '시작 스택' },
    })

    expect(root.textContent).toContain('시작 스택')
  })
})
