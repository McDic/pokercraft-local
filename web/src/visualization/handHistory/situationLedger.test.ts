/**
 * The ledger's contract, and above all the one that failed in review:
 *
 *   **every decision classifyHand emits reaches a row.**
 *
 * A family list that does not cover the classifier fails invisibly. The decision is still
 * computed, still correct, and then dropped: it becomes no row, and it is not counted among
 * the `hidden` ones either — so the chart looks complete. The first draft of this file
 * silently swallowed every over-limp and every 4-bet-facing decision, and nothing said so.
 * Hence the coverage test below, which is the only thing standing between a new
 * PreflopContext and a chart that quietly stops mentioning it.
 */

import { describe, it, expect } from 'vitest'
import type { PreflopContext, HeroPreflopAction, PreflopSituation } from '../../analysis/preflopSituation'
import { DEFAULT_FILTERS } from './situationFilters'
import {
  EXCLUSIONS,
  FAMILIES,
  POSITIONS,
  buildLedgerRows,
  getSituationLedgerData,
} from './situationLedger'

/** A stub translator: the ledger only ever uses keys for labels, so echoing them is enough. */
const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}(${JSON.stringify(values)})` : key) as never

function situation(over: Partial<PreflopSituation> = {}): PreflopSituation {
  return {
    context: 'unopened',
    action: 'raise',
    allIn: false,
    heroOffset: 0,
    openerBucket: null,
    raiseToBB: null,
    heroStackBB: 50,
    tableSize: 6,
    deltaBB: 1,
    cards: null,
    ...over,
  }
}

/**
 * Every (context, action) pair Hero can actually reach.
 *
 * `check` only appears in a limped pot: facing a raise there is always something to call,
 * and when the action folds around to an unraised big blind the hand simply ends — GG
 * writes no check, so that node never exists. Everything else is reachable in all six
 * contexts, and all of these were observed in a real 72,840-hand corpus.
 */
const CONTEXTS: PreflopContext[] = [
  'unopened',
  'limped',
  'raised',
  'raisedCalled',
  'threeBet',
  'fourBetPlus',
]

const REACHABLE: Array<[PreflopContext, HeroPreflopAction]> = [
  ...CONTEXTS.flatMap(
    (c): Array<[PreflopContext, HeroPreflopAction]> => [
      [c, 'fold'],
      [c, 'call'],
      [c, 'raise'],
    ]
  ),
  ['limped', 'check'],
]

/** Every seat the ledger has a row for. An exclusion may carve out just one of them. */
const OFFSETS = POSITIONS.map(([offset]) => offset)

function everySituation(): PreflopSituation[] {
  return REACHABLE.flatMap(([context, action]) =>
    [false, true].flatMap(allIn =>
      OFFSETS.map(heroOffset => situation({ context, action, allIn, heroOffset }))
    )
  )
}

describe('family coverage', () => {
  it('gives every reachable decision exactly one home', () => {
    // The invariant, and the reason this file exists. `buildLedgerRows` tests exclusions
    // first, so an exclusion *overrides* a family it overlaps — that is how a single seat
    // (the big blind's iso-raise) is carved out of a family that is otherwise sound. What
    // must never happen is a decision that is neither charted nor excluded: it would be
    // computed, correct, and gone without a trace.
    const wrong: string[] = []

    for (const s of everySituation()) {
      const families = FAMILIES.filter(f => f.match(s))
      const exclusions = EXCLUSIONS.filter(e => e.match(s))
      const label = `${s.context}/${s.action}${s.allIn ? '+allin' : ''} @${s.heroOffset}`

      if (exclusions.length > 1) {
        wrong.push(`${label}: matched ${exclusions.length} exclusions, which double-counts it`)
        continue
      }
      if (s.action === 'fold') {
        // Folds are the baseline: Δ is 0 by construction, so a fold row would be a row of
        // zeros. They are left out on purpose, not by omission.
        if (families.length || exclusions.length) wrong.push(`${label}: a fold needs no home`)
        continue
      }
      // Two families matching is a bug whether or not an exclusion also covers it: the
      // exclusion could later be narrowed, and the double-match would surface only then.
      if (families.length > 1) {
        wrong.push(`${label}: matched ${families.length} families, which double-counts it`)
        continue
      }
      if (exclusions.length === 1) continue // deliberately withheld, and counted in the caption
      if (families.length !== 1) {
        wrong.push(`${label}: matched ${families.length} families and no exclusion`)
      }
    }

    expect(wrong).toEqual([])
  })

  it('has no family that nothing can reach', () => {
    const orphans = FAMILIES.filter(f => !everySituation().some(s => f.match(s)))
    expect(orphans.map(f => f.key)).toEqual([])
  })

  it('has no exclusion that nothing can reach', () => {
    // An exclusion for a decision that cannot happen is a claim in the caption about
    // nothing — and worse, it would hide the fact that the real decision is uncovered.
    const orphans = EXCLUSIONS.filter(e => !everySituation().some(s => e.match(s)))
    expect(orphans.map(e => e.key)).toEqual([])
  })

  it('leaves the iso-raise family alive everywhere but the big blind', () => {
    // The exclusion is a seat, not the whole family: raising over limpers from the cutoff is
    // a decision against folding and stays on the chart.
    const isoAt = (heroOffset: number) =>
      EXCLUSIONS.some(e => e.match(situation({ context: 'limped', action: 'raise', heroOffset })))

    expect(isoAt(2)).toBe(true) // BB — the only seat that can check for free
    expect(isoAt(1)).toBe(false) // SB — folding forfeits half a blind, so it is a real line
    expect(isoAt(-1)).toBe(false) // CO
    expect(isoAt(0)).toBe(false) // BTN
  })
})

describe('buildLedgerRows', () => {
  const many = (n: number, over: Partial<PreflopSituation>) =>
    Array.from({ length: n }, () => situation(over))

  it('withholds a row below the minimum sample, and counts it as hidden', () => {
    const { rows, hidden } = buildLedgerRows(
      many(5, { context: 'unopened', action: 'raise', heroOffset: 0 }),
      { ...DEFAULT_FILTERS, minSample: 30 },
      t
    )
    expect(rows).toEqual([])
    expect(hidden).toBe(1)
  })

  it('does not count a fold as hidden — it was never a candidate row', () => {
    const { rows, hidden } = buildLedgerRows(
      many(5, { context: 'raised', action: 'fold', deltaBB: 0 }),
      { ...DEFAULT_FILTERS, minSample: 30 },
      t
    )
    expect(rows).toEqual([])
    expect(hidden).toBe(0)
  })

  it('does not chart an excluded decision, and does not call it hidden either', () => {
    // Three exclusions, and the third is the one with teeth. `limped/check` and
    // `fourBetPlus/raise` match no family at all, so they would fall out of the fold path
    // even with the exclusion gate deleted — asserting on them alone would be vacuous, which
    // is exactly what this test was until review caught it. `limped/raise` at the BB *does*
    // match a family (iso-raise), so it can only be missing because an exclusion removed it:
    // delete the gate and this row comes back, forty strong, well over the threshold.
    //
    // `hidden` matters as much as `rows`. It means "a row you could get back by lowering the
    // threshold". An exclusion never comes back, so counting one as hidden would be a lie
    // the reader could act on.
    const { rows, hidden } = buildLedgerRows(
      [
        ...many(40, { context: 'limped', action: 'check', heroOffset: 2 }),
        ...many(40, { context: 'fourBetPlus', action: 'raise', heroOffset: 0 }),
        ...many(40, { context: 'limped', action: 'raise', heroOffset: 2 }), // iso-raise · BB
        ...many(40, { context: 'unopened', action: 'raise', heroOffset: 0 }),
      ],
      { ...DEFAULT_FILTERS, minSample: 30 },
      t
    )

    expect(rows).toHaveLength(1) // only the RFI
    expect(rows[0].label).toContain('chart.situation.family.rfi')
    expect(hidden).toBe(0)
  })

  it('says nothing in the caption about what it excludes', () => {
    // The ledger's other caption counts are contingent — `hidden` moves with your filters,
    // `droppedHands` should be zero. An exclusion is neither: it is a permanent property of
    // what this chart is, true of every dataset, and nothing the reader can act on. Stacking
    // "Not shown (536): free checks in a limped big blind…" into the caption on every render
    // was noise. (The hand-class chart still reports it — there the reader can *select* an
    // excluded scope, and a blank panel then owes them an answer.)
    const { caption } = getSituationLedgerData(
      [
        ...many(40, { context: 'limped', action: 'check', heroOffset: 2 }),
        ...many(40, { context: 'unopened', action: 'raise', heroOffset: 0 }),
      ],
      DEFAULT_FILTERS,
      t
    )
    expect(caption.join('\n')).not.toContain('excluded')
    expect(caption.join('\n')).not.toContain('Not shown')
  })

  it('lets an exclusion override the family it overlaps, and keeps the rest of that family', () => {
    // The one behaviour in this file that a plausible refactor silently undoes. `buildLedgerRows`
    // tests exclusions *before* families; hoist the family lookup above it — a natural
    // micro-optimisation, since the family path is the common one — and "Iso-raise · BB"
    // quietly returns as a row. Every other test in the suite passes either way, because they
    // interrogate the FAMILIES and EXCLUSIONS tables directly and never go through the
    // builder. This one goes through the builder, and it is what kills that mutant.
    const { rows, hidden } = buildLedgerRows(
      [
        ...many(40, { context: 'limped', action: 'raise', heroOffset: 2, deltaBB: 10 }), // BB: excluded
        ...many(40, { context: 'limped', action: 'raise', heroOffset: -1, deltaBB: 0 }), // CO: charted
      ],
      { ...DEFAULT_FILTERS, minSample: 30 },
      t
    )

    // The seat is carved out; the family survives everywhere else.
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toContain('chart.situation.family.isoRaise')
    expect(rows[0].label).toContain('position.co')
    expect(rows[0].n).toBe(40)
    expect(rows[0].mean).toBeCloseTo(0) // not 5 — the +10 BB hands are not averaged in
    expect(hidden).toBe(0) // withheld on principle, not for sample size
  })

  it('still says the things the reader *can* act on', () => {
    // Dropping the exclusion lines must not take the contingent counts with them: `hidden`
    // moves with the sample threshold and `droppedHands` means the corpus has a hole.
    const { caption } = getSituationLedgerData(
      [
        ...many(5, { context: 'unopened', action: 'raise', heroOffset: 0 }),
        ...many(40, { context: 'raised', action: 'call', heroOffset: 2 }),
      ],
      DEFAULT_FILTERS,
      t,
      3
    )
    expect(caption.join('\n')).toContain('chart.situation.ledger.caption.hidden')
    expect(caption.join('\n')).toContain('chart.situation.ledger.caption.dropped')
  })

  it('summarises a bucket, and puts the sample size in the label', () => {
    const deltas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const { rows } = buildLedgerRows(
      deltas.map(deltaBB => situation({ context: 'raised', action: 'call', heroOffset: 2, deltaBB })),
      { ...DEFAULT_FILTERS, minSample: 10 },
      t
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].n).toBe(10)
    expect(rows[0].mean).toBeCloseTo(5.5)
    expect(rows[0].total).toBeCloseTo(55)
    // sd = 3.0277, so 1.96 * 3.0277 / sqrt(10) = 1.877
    expect(rows[0].ci95).toBeCloseTo(1.877, 2)
    expect(rows[0].label).toContain('"n":10')
  })

  it('keeps heads-up out of the short-handed rows', () => {
    // The whole reason tableSize is carried: an HU button is reported at the SB offset, so
    // without this filter an HU steal is averaged into the 6-max SB open.
    const situations = [
      ...many(40, { context: 'unopened', action: 'raise', heroOffset: 1, tableSize: 2, deltaBB: 10 }),
      ...many(40, { context: 'unopened', action: 'raise', heroOffset: 1, tableSize: 6, deltaBB: 1 }),
    ]

    const pooled = buildLedgerRows(situations, { ...DEFAULT_FILTERS, minSample: 30 }, t)
    expect(pooled.rows).toHaveLength(1)
    expect(pooled.rows[0].mean).toBeCloseTo(5.5) // the misleading average

    const hu = buildLedgerRows(
      situations,
      { ...DEFAULT_FILTERS, tableBucket: 'headsUp', minSample: 30 },
      t
    )
    expect(hu.rows).toHaveLength(1)
    expect(hu.rows[0].mean).toBeCloseTo(10)

    const six = buildLedgerRows(
      situations,
      { ...DEFAULT_FILTERS, tableBucket: 'shorthanded', minSample: 30 },
      t
    )
    expect(six.rows).toHaveLength(1)
    expect(six.rows[0].mean).toBeCloseTo(1)
  })

  it('pins the row axis, and leaves the value axes zoomable', () => {
    // The rows are named categories, not a scale: the chart is sized to show all of them,
    // so a vertical zoom can only ever hide rows. The value axes are a real scale and stay
    // zoomable, which is the zoom that is actually useful when the low-sample rows have
    // intervals wide enough to squash everything else against zero.
    const { layout } = getSituationLedgerData(
      many(30, { context: 'unopened', action: 'raise', heroOffset: 0 }),
      DEFAULT_FILTERS,
      t
    )
    const l = layout as Record<string, { fixedrange?: boolean }>
    expect(l.yaxis.fixedrange).toBe(true)
    expect(l.xaxis.fixedrange).toBeUndefined()
    expect(l.xaxis2.fixedrange).toBeUndefined()
  })

  it('emits rows in family order, not in the order the data happened to arrive', () => {
    const situations = [
      ...many(30, { context: 'threeBet', action: 'raise', heroOffset: 0 }), // 4-bet, deep
      ...many(30, { context: 'unopened', action: 'raise', heroOffset: 0 }), // RFI, shallow
    ]
    const { rows } = buildLedgerRows(situations, { ...DEFAULT_FILTERS, minSample: 30 }, t)

    // RFI is declared before the 4-bet family, so it leads regardless of input order —
    // which is what lets the caption promise that groups run smallest pot to largest.
    expect(rows).toHaveLength(2)
    expect(rows[0].label).toContain('chart.situation.family.rfi')
    expect(rows[1].label).toContain('chart.situation.family.fourBet')
  })
})
