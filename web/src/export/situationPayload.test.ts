/**
 * The wire format between the app and the exported file.
 *
 * Every decision the download draws passes through here, so a lossy field is not a display
 * bug — it is a *different dataset*, quietly. The charts would still render, still be
 * coloured, still carry their captions, and be built from data the app never saw.
 */

import { describe, it, expect } from 'vitest'
import type { PreflopSituation } from '../analysis/preflopSituation'
import { identityT } from '../test/i18n'
import { getSituationLedgerData } from '../visualization/handHistory/situationLedger'
import { getHandClassProfitData, DEFAULT_SCOPE } from '../visualization/handHistory/handClassProfit'
import { DEFAULT_FILTERS } from '../visualization/handHistory/situationFilters'
import { exportableSituations, packSituation, unpackSituation } from './situationPayload'

function situation(overrides: Partial<PreflopSituation> = {}): PreflopSituation {
  return {
    context: 'raised',
    action: 'call',
    allIn: false,
    heroOffset: 2,
    openerBucket: 'lp',
    raiseToBB: 2.5,
    heroStackBB: 27.5,
    tableSize: 6,
    deltaBB: 1.25,
    cards: ['Ah', 'Kd'],
    ...overrides,
  }
}

describe('packSituation / unpackSituation', () => {
  it('round-trips every field', () => {
    const original = situation()
    expect(unpackSituation(packSituation(original))).toEqual(original)
  })

  it('round-trips every context and action the classifier can emit', () => {
    // The codes are a Record over the union, so the compiler already refuses a context with no
    // encoding. What it cannot check is that decoding *inverts* encoding — an off-by-one in
    // the inverted table would map every `raised` decision to `limped`, and the ledger would
    // cheerfully file 3-bets under iso-raises.
    const contexts: Array<PreflopSituation['context']> = [
      'unopened',
      'limped',
      'raised',
      'raisedCalled',
      'threeBet',
      'fourBetPlus',
    ]
    const actions: Array<PreflopSituation['action']> = ['fold', 'check', 'call', 'raise']

    for (const context of contexts) {
      for (const action of actions) {
        const s = situation({ context, action })
        const back = unpackSituation(packSituation(s))
        expect(back.context, `${context}/${action}`).toBe(context)
        expect(back.action, `${context}/${action}`).toBe(action)
      }
    }
  })

  it('round-trips every opener bucket, and the absence of one', () => {
    for (const openerBucket of ['ep', 'mp', 'lp', 'blinds'] as const) {
      expect(unpackSituation(packSituation(situation({ openerBucket }))).openerBucket).toBe(
        openerBucket
      )
    }
    // -1 on the wire. Not to be confused with `ep`, which is code 0 — the distinction is
    // "nobody raised" versus "someone raised from early position".
    expect(unpackSituation(packSituation(situation({ openerBucket: null }))).openerBucket).toBeNull()
  })

  it('round-trips an all-in', () => {
    // `allIn` is read by exactly one family — the open jam — and it is the only boolean on the
    // wire, so it is the one field a truthiness bug could flip without anything else noticing.
    // An open raise filed as an open jam would move a whole row of the ledger.
    expect(unpackSituation(packSituation(situation({ allIn: true }))).allIn).toBe(true)
    expect(unpackSituation(packSituation(situation({ allIn: false }))).allIn).toBe(false)
  })

  it('keeps an open jam apart from an open raise, through the charts', () => {
    // The end of that story: the two differ only in `allIn`, and they are different rows.
    const jams = Array.from({ length: 40 }, (_, i) =>
      situation({ context: 'unopened', action: 'raise', allIn: true, deltaBB: i / 4 })
    )
    const raises = Array.from({ length: 40 }, (_, i) =>
      situation({ context: 'unopened', action: 'raise', allIn: false, deltaBB: -i / 4 })
    )
    const packed = exportableSituations([...jams, ...raises]).map(unpackSituation)

    const rows = getSituationLedgerData(packed, DEFAULT_FILTERS, identityT, 0).layout.yaxis
      ?.ticktext as string[]
    expect(rows.some(r => r.includes('chart.situation.family.openJam'))).toBe(true)
    expect(rows.some(r => r.includes('chart.situation.family.rfi'))).toBe(true)
  })

  it('keeps a missing hand missing', () => {
    expect(unpackSituation(packSituation(situation({ cards: null }))).cards).toBeNull()
    expect(unpackSituation(packSituation(situation({ raiseToBB: null }))).raiseToBB).toBeNull()
  })

  it('keeps the button apart from the pooled scope', () => {
    // heroOffset 0 is the button. It survives as 0, not as a falsy that reads as "no offset".
    expect(unpackSituation(packSituation(situation({ heroOffset: 0 }))).heroOffset).toBe(0)
    expect(unpackSituation(packSituation(situation({ heroOffset: -5 }))).heroOffset).toBe(-5)
  })

  it('rounds nothing', () => {
    // The exported chart is not *close to* the app's, it is the same chart — and that is only
    // true if the numbers it is built from are the same numbers, bit for bit. A 6-decimal wire
    // format was tried and dropped: it cost 0.2MB less and made the guarantee conditional.
    // `situationRuntime.test` asserts plain equality between the two figures, which is an
    // assertion only full precision can support.
    // Computed, not written out: these are the shape a real Δ actually has — a net result
    // divided by the big blind — and a 17-digit literal would silently lose precision before
    // the codec ever saw it, which would make this test pass for the wrong reason.
    const s = situation({ deltaBB: -100 / 7, heroStackBB: 250 / 9 })
    const back = unpackSituation(packSituation(s))

    expect(back.deltaBB).toBe(s.deltaBB)
    expect(back.heroStackBB).toBe(s.heroStackBB)
    // And it really is a number with a long tail, or the assertions above prove nothing.
    expect(String(s.deltaBB).length).toBeGreaterThan(10)
  })

  it('cannot move a decision into a different stack bucket', () => {
    // The buckets have their edges at whole big blinds (15 / 25 / 40). A wire format that
    // nudged a stack across one would silently re-file the decision under a different filter —
    // the chart would still draw, from data the app never had.
    for (const heroStackBB of [14.999999999, 15, 24.999999999, 25, 39.999999999, 40]) {
      expect(unpackSituation(packSituation(situation({ heroStackBB }))).heroStackBB).toBe(
        heroStackBB
      )
    }
  })

  it('keeps a negative delta negative', () => {
    expect(unpackSituation(packSituation(situation({ deltaBB: -12.5 }))).deltaBB).toBe(-12.5)
  })
})

describe('exportableSituations', () => {
  it('drops folds, and nothing else', () => {
    const kept = [
      situation({ action: 'call' }),
      situation({ action: 'raise' }),
      situation({ action: 'check' }),
    ]
    const rows = exportableSituations([...kept, situation({ action: 'fold' })])

    expect(rows).toHaveLength(3)
    expect(rows.map(unpackSituation).map(s => s.action)).toEqual(['call', 'raise', 'check'])
  })

  it('is safe to drop them, because neither chart can draw one', () => {
    // Driven through the *real* builders, because the claim is about them.
    //
    // An earlier version of this test asserted `exportableSituations(folds) === []`, which is
    // the definition of the function rather than a fact about the charts — it would have
    // stayed green while the export quietly lost 78% of its data. What has to be true is that
    // a fold changes *nothing a chart shows*: not a row, not a `hidden` count, not `inScope`,
    // not a caption. So both figures are built with the folds and without them, and compared
    // whole — traces and caption alike.
    const decisions = [
      ...Array.from({ length: 40 }, (_, i) => situation({ deltaBB: i - 20 })),
      ...Array.from({ length: 40 }, (_, i) =>
        situation({ context: 'unopened', action: 'raise', deltaBB: i / 4 })
      ),
    ]
    const folds: PreflopSituation[] = [
      situation({ action: 'fold', context: 'unopened', deltaBB: 0 }),
      situation({ action: 'fold', context: 'raised', deltaBB: 0 }),
      situation({ action: 'fold', context: 'threeBet', deltaBB: 0 }),
      // A fold is Δ=0 *by construction*; one that is not would be a classifier bug, and it
      // must still not sneak into a chart through this format.
      situation({ action: 'fold', context: 'raised', deltaBB: 99 }),
    ]

    const withFolds = [...decisions, ...folds]
    expect(getSituationLedgerData(withFolds, DEFAULT_FILTERS, identityT, 0)).toEqual(
      getSituationLedgerData(decisions, DEFAULT_FILTERS, identityT, 0)
    )
    expect(getHandClassProfitData(withFolds, DEFAULT_FILTERS, DEFAULT_SCOPE, identityT)).toEqual(
      getHandClassProfitData(decisions, DEFAULT_FILTERS, DEFAULT_SCOPE, identityT)
    )
  })
})
