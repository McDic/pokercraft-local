/**
 * Checks that every place the source names a translation key passes exactly the values
 * that key's English text interpolates.
 *
 * This is the one i18n mistake nothing else catches. The type system checks that the
 * *key* exists; locales.test.ts checks that en and ko agree on the placeholders inside
 * it. Neither looks at the call site, so
 *
 *     t('chart.bankroll.tick.buyIns', { initialCapital: r.initialCapital })
 *
 * against `"{{capital}} buy-ins"` type-checks, tests green, and ships an axis whose
 * every tick reads the literal `{{capital}} buy-ins`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import en from './locales/en.json'

const SRC = join(import.meta.dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : []
  })
}

/** Names inside `{{...}}` in a translation value. */
function placeholders(value: string): Set<string> {
  return new Set(Array.from(value.matchAll(/\{\{(\w+)}}/g), m => m[1]))
}

/**
 * Top-level property names of the object literal starting at `open`.
 *
 * Tracks brace depth so nested objects stay out of the way, tracks paren/bracket depth
 * so an argument list's commas (`getRangeUsage(matrix, 0.1)`) do not read as property
 * separators, skips string literals so their contents cannot be mistaken for syntax,
 * and only takes an identifier where one is actually expected — right after `{` or `,`.
 * Without that last rule the *values* get collected too, and shorthand (`{ trial }`)
 * has to be accepted alongside `name:`.
 */
function objectKeys(source: string, open: number): Set<string> | null {
  const names = new Set<string>()
  let brace = 0
  let nesting = 0
  let expectName = false

  for (let i = open; i < source.length; i++) {
    const ch = source[i]

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i++
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++
        i++
      }
      continue
    }

    if (ch === '{') {
      brace++
      if (brace === 1) expectName = true
      continue
    }
    if (ch === '}') {
      brace--
      if (brace === 0) return names
      continue
    }
    if (brace !== 1) continue

    if (ch === '(' || ch === '[') nesting++
    else if (ch === ')' || ch === ']') nesting--
    else if (ch === ',' && nesting === 0) expectName = true
    else if (expectName && nesting === 0 && /[A-Za-z_$]/.test(ch)) {
      const name = /^[\w$]+/.exec(source.slice(i))!
      names.add(name[0])
      i += name[0].length - 1
      expectName = false
    }
  }
  return null // unbalanced — unparseable, so report nothing rather than assert on garbage
}

interface CallSite {
  file: string
  key: string
  /** `null` when the object literal could not be parsed — an error, never a skip. */
  values: Set<string> | null
}

/**
 * Every literal mention of a translation key, with the values handed alongside it.
 *
 * Deliberately not tied to `t(...)`: keys also travel as data. The worker and the chart
 * components carry them as `messageKey` / `messageParams` precisely so the text can be
 * rendered later in the current language — and those are the keys that interpolate most,
 * so a scanner that only understood `t(` would miss the ones that matter.
 */
function callSites(): CallSite[] {
  const found: CallSite[] = []

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8')

    for (const match of source.matchAll(/['"]([\w.]+)['"]/g)) {
      const key = match[1]
      // hasOwnProperty, not `in`: `in` walks the prototype chain, so a quoted
      // 'toString' or 'constructor' anywhere in src/ would be taken for a key and then
      // crash `placeholders()` with a function instead of a string.
      if (!Object.prototype.hasOwnProperty.call(en, key)) continue

      const after = source.slice(match.index + match[0].length)

      // `t('key', { ... })`, `postProgress(..., 'key', { ... })`
      let object = /^\s*,\s*\{/.exec(after)
      // `messageKey: 'key', messageParams: { ... }`
      if (!object) object = /^\s*,\s*messageParams\s*:\s*\{/.exec(after)
      // `<Trans i18nKey="key" values={{ ... }} />` — the outer brace is JSX, so the
      // match ends on the inner one, which is the object we actually want.
      if (!object) object = /^\s*values=\{\{/.exec(after)

      // A site whose values cannot be parsed is reported, never dropped. Skipping it
      // would silently stop checking that key — the precise vacuity this file exists to
      // avoid — and the trigger is ordinary: an apostrophe in a comment inside the
      // object would send the string-skipper to the end of the file.
      const values = object
        ? objectKeys(source, match.index + match[0].length + object[0].length - 1)
        : new Set<string>()

      found.push({ file: file.slice(SRC.length + 1), key, values })
    }
  }
  return found
}

describe('translation key usages', () => {
  const sites = callSites()

  // Without this, a regex that quietly matches nothing would make the suite below pass
  // vacuously — the failure mode of every source-scanning test.
  it('actually finds the usages', () => {
    expect(sites.length).toBeGreaterThan(50)

    const byKey = (key: string) => sites.find(s => s.key === key)?.values
    // A direct t() call with values.
    expect(byKey('chart.bankroll.tick.buyIns')).toEqual(new Set(['capital']))
    // A key travelling as data through the worker protocol.
    expect(byKey('progress.chart.equity')).toEqual(new Set(['current', 'total']))
    // A key with no values at all.
    expect(byKey('charts.noHandHistoryData')).toEqual(new Set())
  })

  // A key nobody uses is worse than clutter: translators spend real effort on it, and it
  // is invisible — the type system only checks the other direction, that a key used
  // exists. Every key here is named as a literal somewhere (including the ones that
  // travel as `messageKey` data), so anything unreferenced is genuinely dead.
  it('has no key that the source never names', () => {
    const used = new Set(sites.map(s => s.key))
    expect(Object.keys(en).filter(key => !used.has(key))).toEqual([])
  })

  it('passes exactly the values each key interpolates', () => {
    const wrong: string[] = []
    for (const { file, key, values } of sites) {
      if (values === null) {
        wrong.push(`${file}: '${key}' — could not parse its values; this scanner needs fixing`)
        continue
      }
      const expected = placeholders((en as Record<string, string>)[key])
      const missing = [...expected].filter(name => !values.has(name))
      const extra = [...values].filter(name => !expected.has(name))
      if (missing.length || extra.length) {
        wrong.push(`${file}: '${key}' missing [${missing}], unexpected [${extra}]`)
      }
    }
    expect(wrong).toEqual([])
  })
})
