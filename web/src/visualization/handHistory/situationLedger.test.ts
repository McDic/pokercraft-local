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
import {
  DEFAULT_FILTERS,
  LEDGER_FAMILIES,
  buildLedgerRows,
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

describe('family coverage', () => {
  it.each(REACHABLE)('%s / %s is matched by exactly one family (or is a fold)', (context, action) => {
    for (const allIn of [false, true]) {
      const s = situation({ context, action, allIn })
      const matched = LEDGER_FAMILIES.filter(f => f.match(s))

      if (action === 'fold') {
        // Folds are the baseline: Δ is 0 by construction, so a fold row would be a row of
        // zeros. They are excluded on purpose, not by omission.
        expect(matched, `fold should match no family`).toHaveLength(0)
      } else {
        expect(
          matched.length,
          `${context}/${action}${allIn ? ' (all-in)' : ''} matched ${matched.length} families`
        ).toBe(1)
      }
    }
  })

  it('has no family that nothing can reach', () => {
    const reachable = REACHABLE.flatMap(([context, action]) =>
      [false, true].map(allIn => situation({ context, action, allIn }))
    )
    const orphans = LEDGER_FAMILIES.filter(f => !reachable.some(s => f.match(s)))
    expect(orphans.map(f => f.key)).toEqual([])
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

  it('emits rows in family order, not in the order the data happened to arrive', () => {
    const situations = [
      ...many(30, { context: 'threeBet', action: 'raise', heroOffset: 0 }), // 4-bet, deep
      ...many(30, { context: 'unopened', action: 'raise', heroOffset: 0 }), // RFI, shallow
    ]
    const { rows } = buildLedgerRows(situations, { ...DEFAULT_FILTERS, minSample: 30 }, t)
    expect(rows.map(r => r.label.split('(')[0])).toEqual([
      'chart.situation.ledger.rowLabel',
      'chart.situation.ledger.rowLabel',
    ])
    // The labels carry the family key in their interpolated values; RFI must come first.
    expect(rows[0].label).toContain('chart.situation.family.rfi')
    expect(rows[1].label).toContain('chart.situation.family.fourBet')
  })
})
