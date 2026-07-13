/**
 * The figure both situation charts are drawn as — and the hover text it composes.
 *
 * Tested against the *real* English strings rather than a stub, because the thing under test
 * is how long they are. A stub translator returns bare keys, which have no spaces in them at
 * all, so it would happily "prove" that an unwrappable string wraps.
 */

import { describe, it, expect } from 'vitest'
import en from '../../i18n/locales/en.json'
import { hoverLabel, summarize } from './deltaFigure'
import { FAMILIES } from './situationLedger'

const strings = en as Record<string, string>

/** What Plotly actually renders: `<br>`-separated lines, with the markup stripped. */
function renderedLines(hovertext: string): string[] {
  return hovertext.split('<br>').map(line => line.replace(/<\/?[bi]>/g, ''))
}

describe('hoverLabel', () => {
  it('wraps a long description, because Plotly will not', () => {
    // Plotly breaks hover text only on an explicit `<br>` — there is no width-based wrapping
    // and no max width. Unwrapped, the longest family description is 167 characters, which
    // renders as one ~1100px line: as wide as the entire chart on a desktop, and clipped at
    // the plot edge on anything smaller.
    const longest = Object.entries(strings)
      .filter(([key]) => key.startsWith('chart.situation.family.') && key.endsWith('.desc'))
      .map(([, value]) => value)
      .sort((a, b) => b.length - a.length)[0]

    expect(longest.length).toBeGreaterThan(100) // otherwise this test is not testing anything
    expect(longest).not.toContain('<br>') // the wrapping is the code's job, not the translator's

    const hovertext = hoverLabel({
      label: 'Call vs. open + caller(s) · BB (n=1322)',
      description: longest,
      n: 1322,
      mean: 0.89,
      ci95: 0.99,
      total: 1061,
    })

    for (const line of renderedLines(hovertext)) {
      expect(line.length, `too wide to fit the plot: "${line}"`).toBeLessThanOrEqual(80)
    }
  })

  it('never breaks a word in half', () => {
    const hovertext = hoverLabel({
      label: 'row',
      description: strings['chart.situation.family.callMultiway.desc'],
      n: 1,
      mean: 0,
      ci95: 0,
      total: 0,
    })
    // Rejoining the wrapped lines has to give back exactly the original sentence.
    const [, ...body] = renderedLines(hovertext)
    expect(body.join(' ')).toBe(strings['chart.situation.family.callMultiway.desc'])
  })

  it('every family description survives the wrap intact', () => {
    for (const family of FAMILIES) {
      const description = strings[family.descKey]
      const [, ...body] = renderedLines(
        hoverLabel({ label: 'row', description, n: 1, mean: 0, ci95: 0, total: 0 })
      )
      expect(body.join(' '), family.descKey).toBe(description)
      for (const line of body) {
        expect(line.length, `${family.descKey}: "${line}"`).toBeLessThanOrEqual(80)
      }
    }
  })

  it('leaves a row with no description alone', () => {
    // The hand-class rows have none: their names are short and the caption defines them.
    const hovertext = hoverLabel({ label: 'Suited connector (n=143)', n: 143, mean: 2.4, ci95: 2.5, total: 343 })
    expect(hovertext).toBe('Suited connector (n=143)')
    expect(hovertext).not.toContain('<br>')
  })
})

describe('summarize', () => {
  it('returns statistics and nothing else', () => {
    // Typed as a `Pick`, not `Omit<DeltaRow, 'label'>`. Callers spread this over a row literal
    // that has already set `description`; if this ever carried an own `description` property —
    // even `undefined` — the spread would erase it and every row would silently lose its
    // hover text.
    expect(Object.keys(summarize([1, 2, 3])).sort()).toEqual(['ci95', 'mean', 'n', 'total'])
  })

  it('defines no interval for a single observation', () => {
    expect(summarize([5])).toEqual({ n: 1, mean: 5, ci95: 0, total: 5 })
  })
})
