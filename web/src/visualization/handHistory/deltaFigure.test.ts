/**
 * The figure both situation charts are drawn as — and the hover text it composes.
 *
 * Tested against the *real* translated strings rather than a stub, because the thing under
 * test is how wide they are. A stub translator returns bare keys, which have no spaces in
 * them at all, so it would happily "prove" that an unwrappable string wraps.
 *
 * And against *every* language, not just English, because the width budget is the one thing
 * translation quietly invalidates: a Hangul syllable renders about twice as wide as a Latin
 * character, so a budget counted in `String.length` is off by 2× the moment the text is
 * Korean — and the tooltip it produces is exactly the chart-wide line `wrap` was written to
 * prevent. The ruler has to be checked in the units the reader sees.
 */

import { describe, it, expect } from 'vitest'
import en from '../../i18n/locales/en.json'
import { LANGUAGES } from '../../i18n'
import { displayWidth, hoverLabel, summarize } from './deltaFigure'
import { FAMILIES } from './situationLedger'

const strings = en as Record<string, string>

/** The widest a hover line may render, in Latin-character widths. */
const MAX_WIDTH = 80

/**
 * How wide a line renders — measured *independently* of the code under test.
 *
 * Deliberately not `displayWidth`. `wrap` budgets its lines with that function, so a test
 * that also measured with it would be holding the same ruler at both ends: break
 * `displayWidth` and the wrapped lines get wider by exactly the amount the assertion stops
 * being able to see. It passes, and it is measuring nothing. (Confirmed, not assumed — with
 * `displayWidth` on both sides, stubbing it back to `.length` left every wrap test green.)
 *
 * So this is a second, independent implementation: narrower than the real one, covering only
 * the scripts actually shipped in `locales/`, and simple enough to check by eye. The two
 * have to agree, and that agreement is the test.
 */
function renderedWidth(line: string): number {
  // Hangul syllables and jamo: the full-width glyphs in the languages we ship.
  return line.length + (line.match(/[ᄀ-ᇿ㄰-㆏가-힣]/g) ?? []).length
}

/** What Plotly actually renders: `<br>`-separated lines, with the markup stripped. */
function renderedLines(hovertext: string): string[] {
  return hovertext.split('<br>').map(line => line.replace(/<\/?[bi]>/g, ''))
}

/** As the app resolves it: a key a language has not translated falls back to English. */
const locales = LANGUAGES.map(
  l => [l.code, l.translation as Record<string, string>] as const
)

describe('displayWidth', () => {
  it('counts a Hangul syllable as two Latin characters', () => {
    // The whole point. `'오픈 레이즈'.length` is 6, and it renders about as wide as 11
    // Latin characters — so a wrapper that trusts `.length` overruns its budget by ~2×.
    expect('오픈 레이즈'.length).toBe(6)
    expect(displayWidth('오픈 레이즈')).toBe(11)
  })

  it('counts Latin, and the symbols these charts actually use, as one', () => {
    expect(displayWidth('Iso-raise vs. limpers')).toBe(21)
    // Δ, ± and · are ambiguous-width, and render narrow in the font Plotly uses.
    expect(displayWidth('Δbb ±2.5 · n=30')).toBe(15)
  })
})

describe.each(locales)('hoverLabel (%s)', (_code, locale) => {
  const describeOf = (key: string) => locale[key] ?? strings[key]

  it('every family description survives the wrap intact, and fits the plot', () => {
    for (const family of FAMILIES) {
      const description = describeOf(family.descKey)
      const [, ...body] = renderedLines(
        hoverLabel({ label: 'row', description, n: 1, mean: 0, ci95: 0, total: 0 })
      )

      // Rejoining the wrapped lines has to give back exactly the original sentence: the
      // wrap may only insert breaks, never drop or mangle a word.
      expect(body.join(' '), family.descKey).toBe(description)

      for (const line of body) {
        expect(renderedWidth(line), `${family.descKey}: "${line}"`).toBeLessThanOrEqual(MAX_WIDTH)
      }
    }
  })

  it('leaves the wrapping to the code, not the translator', () => {
    // A `<br>` seeded into a translation would survive a rename of the wrap budget and go
    // stale silently — and it makes every translator responsible for re-breaking sentences
    // they rewrite. (locales.test.ts pins that ko cannot *drop* markup en has; this is the
    // other direction, for the markup neither should have.)
    for (const family of FAMILIES) {
      expect(describeOf(family.descKey), family.descKey).not.toContain('<br>')
    }
  })
})

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

    const hovertext = hoverLabel({
      label: 'Call vs. open + caller(s) · BB (n=1322)',
      description: longest,
      n: 1322,
      mean: 0.89,
      ci95: 0.99,
      total: 1061,
    })

    expect(renderedLines(hovertext).length).toBeGreaterThan(1) // it really did break
    for (const line of renderedLines(hovertext)) {
      expect(renderedWidth(line), `too wide to fit the plot: "${line}"`).toBeLessThanOrEqual(
        MAX_WIDTH
      )
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
