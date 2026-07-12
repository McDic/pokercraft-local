/**
 * Guards the locale files against the mistakes a translator can actually make.
 *
 * A *missing* key is deliberately not an error — i18next falls back to English,
 * which is what makes a partial translation a valid contribution. What is an error
 * is a key that does not exist (a typo, or one left behind after a rename), or a
 * translation that drops one of the values the app substitutes into it.
 */

import { describe, it, expect } from 'vitest'
import en from './locales/en.json'
import { LANGUAGES } from './index'

/** Names inside `{{...}}`, which i18next replaces with runtime values. */
function placeholders(value: string): Set<string> {
  return new Set(Array.from(value.matchAll(/\{\{(\w+)}}/g), m => m[1]))
}

/** Plotly's own `%{...}` fields, which must survive translation verbatim. */
function plotlyFields(value: string): Set<string> {
  return new Set(Array.from(value.matchAll(/%\{([^}]+)}/g), m => m[1]))
}

const englishKeys = Object.keys(en)

// Driven off the same registry the app is, so a language added to LANGUAGES is
// checked here automatically rather than only when someone remembers to list it.
const translated = LANGUAGES.filter(l => l.code !== 'en').map(
  l => [l.code, l.translation as Record<string, string>] as const
)

describe('locales', () => {
  it('has a translation bundle for every language in the switcher', () => {
    for (const { code, translation } of LANGUAGES) {
      expect(Object.keys(translation).length, `${code} has no keys`).toBeGreaterThan(0)
    }
  })

  it('has no empty English values', () => {
    const empty = englishKeys.filter(key => !(en as Record<string, string>)[key].trim())
    expect(empty).toEqual([])
  })

  describe.each(translated)('%s.json', (_code, locale) => {
    it('defines no key that en.json does not', () => {
      const unknown = Object.keys(locale).filter(key => !(key in en))
      expect(unknown).toEqual([])
    })

    it('keeps every {{placeholder}} the English has, and invents none', () => {
      const mismatched: string[] = []
      for (const [key, value] of Object.entries(locale)) {
        const source = (en as Record<string, string>)[key]
        if (source === undefined) continue
        const expected = placeholders(source)
        const actual = placeholders(value)
        const missing = [...expected].filter(name => !actual.has(name))
        const extra = [...actual].filter(name => !expected.has(name))
        if (missing.length || extra.length) {
          mismatched.push(`${key}: missing [${missing}], unexpected [${extra}]`)
        }
      }
      expect(mismatched).toEqual([])
    })

    it('keeps every Plotly %{field} the English has, and invents none', () => {
      // Both directions matter: a dropped field loses data from the tooltip, and an
      // invented one (a typo like `%{customdata[9]}`) renders as a literal in the
      // chart, which no type check can catch because it lives inside a string.
      const mismatched: string[] = []
      for (const [key, value] of Object.entries(locale)) {
        const source = (en as Record<string, string>)[key]
        if (source === undefined) continue
        const expected = plotlyFields(source)
        const actual = plotlyFields(value)
        const missing = [...expected].filter(field => !actual.has(field))
        const extra = [...actual].filter(field => !expected.has(field))
        if (missing.length || extra.length) {
          mismatched.push(`${key}: dropped [${missing}], unexpected [${extra}]`)
        }
      }
      expect(mismatched).toEqual([])
    })

    it('reports its coverage', () => {
      // An untranslated key is legitimate — i18next falls back to English, which is
      // what makes a partial translation a valid contribution. So this reports the
      // gap rather than failing on it; what it does assert is that the file is a
      // real translation and not an empty stub.
      const missing = englishKeys.filter(key => !(key in locale))
      const done = englishKeys.length - missing.length
      console.info(`  coverage: ${done}/${englishKeys.length} keys`)
      if (missing.length) {
        console.warn(`  untranslated: ${missing.join(', ')}`)
      }
      expect(done).toBeGreaterThan(0)
    })
  })
})
