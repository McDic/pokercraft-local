/**
 * The control descriptors, which two renderers share.
 *
 * The React filter bar and the exported file's DOM filter bar both read these. That is the
 * point: a control's options, and what picking one does to the state, must not exist twice.
 * So what is tested here is the property both renderers depend on and neither can check —
 * that an option a `<select>` can offer is an option the state can actually hold, and that
 * choosing it makes the control read back as chosen.
 */

import { describe, it, expect } from 'vitest'
import { identityT } from '../../test/i18n'
import type { Control } from './situationControls'
import { FILTER_CONTROLS, SCOPE_CONTROLS } from './situationControls'
import { DEFAULT_FILTERS } from './situationFilters'
import { DEFAULT_SCOPE } from './handClassProfit'

/**
 * Pick every option, and check the control then says you picked it.
 *
 * `valueOf(apply(state, v)) === v` is a small identity with a lot of reach. It fails if a
 * reducer writes a field the reader does not read (the two used to be written out separately
 * on each side, and this is the mistake that would have made); if an option's value does not
 * survive the round trip through the state (a number stringified one way and parsed another);
 * or if an option is offered that the state cannot represent at all.
 *
 * A `<select>` is exactly this identity made visible: choose "Heads-up", and the box has to
 * still read "Heads-up" afterwards. If it does not, the chart is filtered by something other
 * than what the control claims.
 */
function checkRoundTrip<S>(control: Control<S>, initial: S): void {
  const options = control.options(identityT)
  expect(options.length, `${control.id} offers nothing`).toBeGreaterThan(1)

  for (const [value] of options) {
    expect(control.valueOf(control.apply(initial, value)), `${control.id} -> ${value}`).toBe(value)
  }
}

describe('FILTER_CONTROLS', () => {
  it('round-trips every option it offers', () => {
    for (const control of FILTER_CONTROLS) checkRoundTrip(control, DEFAULT_FILTERS)
  })

  it('covers every field of SituationFilters, and invents none', () => {
    // Applying each control's own options can only ever touch its own field — so the union of
    // the fields they change must be the whole of `SituationFilters`. A fifth filter added to
    // the type but not to this table would render nowhere, in the app *or* the export, and
    // silently default: the chart would be narrowed by a filter with no dropdown.
    const before = DEFAULT_FILTERS as unknown as Record<string, unknown>
    const touched = new Set<string>()
    for (const control of FILTER_CONTROLS) {
      for (const [value] of control.options(identityT)) {
        const next = control.apply(DEFAULT_FILTERS, value) as unknown as Record<string, unknown>
        for (const key of Object.keys(next)) {
          if (next[key] !== before[key]) touched.add(key)
        }
      }
    }
    expect([...touched].sort()).toEqual(Object.keys(DEFAULT_FILTERS).sort())
  })

  it('leaves the other filters alone', () => {
    // Each control owns exactly one field. A reducer that reset a neighbour would make the
    // filter bar unusable in a way that looks like a data problem, not a code one.
    const narrowed = FILTER_CONTROLS.reduce(
      (f, control) => control.apply(f, control.options(identityT)[1][0]),
      DEFAULT_FILTERS
    )
    for (const control of FILTER_CONTROLS) {
      const value = control.options(identityT)[1][0]
      expect(control.valueOf(control.apply(narrowed, value))).toBe(value)
    }
    // All four moved off their defaults, so nothing overwrote anything.
    expect(narrowed).not.toEqual(DEFAULT_FILTERS)
    expect(Object.values(narrowed).filter(v => v !== 'any').length).toBeGreaterThan(1)
  })

  it('offers "Any" first on every bucket filter', () => {
    // The unfiltered view has to be reachable, and reachable in the obvious place.
    for (const control of FILTER_CONTROLS) {
      if (control.id === 'minSample') continue // a count, which has no "Any"
      expect(control.options(identityT)[0][0], control.id).toBe('any')
    }
  })
})

describe('SCOPE_CONTROLS', () => {
  it('round-trips every option it offers', () => {
    for (const control of SCOPE_CONTROLS) checkRoundTrip(control, DEFAULT_SCOPE)
  })

  it('can pool every position, and can pick each one', () => {
    const position = SCOPE_CONTROLS.find(c => c.id === 'position')!
    const values = position.options(identityT).map(([value]) => value)

    expect(values).toContain('any')
    // `null` is the pooled scope; it must not come back as the number 0, which is the button.
    expect(position.apply(DEFAULT_SCOPE, 'any').heroOffset).toBeNull()
    expect(position.apply(DEFAULT_SCOPE, '0').heroOffset).toBe(0)
  })
})
