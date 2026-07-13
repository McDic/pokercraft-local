import { describe, it, expect } from 'vitest'
import type { CardString } from '../../types'
import type { PreflopSituation } from '../../analysis/preflopSituation'
import { DEFAULT_FILTERS } from './situationFilters'
import { FAMILIES } from './situationLedger'
import { DEFAULT_SCOPE, buildHandClassRows, getHandClassProfitData } from './handClassProfit'

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}(${JSON.stringify(values)})` : key) as never

const FLAT = FAMILIES.findIndex(f => f.key === 'chart.situation.family.flat')
const RFI = FAMILIES.findIndex(f => f.key === 'chart.situation.family.rfi')

/** A "flat / defend vs. open" decision, which is what DEFAULT_SCOPE breaks down. */
function flat(over: Partial<PreflopSituation> = {}): PreflopSituation {
  return {
    context: 'raised',
    action: 'call',
    allIn: false,
    heroOffset: 2, // BB
    openerBucket: 'lp',
    raiseToBB: 2.5,
    heroStackBB: 50,
    tableSize: 6,
    deltaBB: 1,
    cards: ['9h', '8h'] as [CardString, CardString], // suited connector
    ...over,
  }
}

const many = (n: number, over: Partial<PreflopSituation> = {}) =>
  Array.from({ length: n }, () => flat(over))

describe('buildHandClassRows', () => {
  it('breaks one action into the hands it is made of', () => {
    const rows = buildHandClassRows(
      [
        ...many(40, { cards: ['9h', '8h'], deltaBB: 3 }), // suited connector
        ...many(40, { cards: ['7h', '2d'], deltaBB: -2 }), // offsuit trash
      ],
      { ...DEFAULT_FILTERS, minSample: 30 },
      DEFAULT_SCOPE,
      t
    ).rows

    expect(rows).toHaveLength(2)
    // Taxonomic order: suited classes come before offsuit ones, whatever the profit says.
    expect(rows[0].label).toContain('chart.handClass.suitedConnector')
    expect(rows[0].mean).toBeCloseTo(3)
    expect(rows[1].label).toContain('chart.handClass.offsuitTrash')
    expect(rows[1].mean).toBeCloseTo(-2)
  })

  it('counts only the chosen action', () => {
    // An RFI and a defence with the same cards must not land in the same bucket — the whole
    // premise is that this chart breaks down *one row* of the ledger.
    const rows = buildHandClassRows(
      [
        ...many(40, { deltaBB: 3 }),
        ...many(40, { context: 'unopened', action: 'raise', deltaBB: 99 }),
      ],
      { ...DEFAULT_FILTERS, minSample: 30 },
      { familyIndex: FLAT, heroOffset: null },
      t
    ).rows

    expect(rows).toHaveLength(1)
    expect(rows[0].n).toBe(40)
    expect(rows[0].mean).toBeCloseTo(3) // the 99s belong to RFI, not here
  })

  it('pools positions when none is chosen, and splits when one is', () => {
    const situations = [
      ...many(40, { heroOffset: 2, deltaBB: 4 }), // BB
      ...many(40, { heroOffset: 1, deltaBB: 0 }), // SB
    ]

    const pooled = buildHandClassRows(
      situations,
      { ...DEFAULT_FILTERS, minSample: 30 },
      { familyIndex: FLAT, heroOffset: null },
      t
    ).rows
    expect(pooled).toHaveLength(1)
    expect(pooled[0].n).toBe(80)
    expect(pooled[0].mean).toBeCloseTo(2)

    const bb = buildHandClassRows(
      situations,
      { ...DEFAULT_FILTERS, minSample: 30 },
      { familyIndex: FLAT, heroOffset: 2 },
      t
    ).rows
    expect(bb).toHaveLength(1)
    expect(bb[0].n).toBe(40)
    expect(bb[0].mean).toBeCloseTo(4)
  })

  it('withholds a class below the minimum sample, and says how many', () => {
    const { rows, hidden } = buildHandClassRows(
      many(5),
      { ...DEFAULT_FILTERS, minSample: 30 },
      DEFAULT_SCOPE,
      t
    )
    expect(rows).toEqual([])
    expect(hidden).toBe(1)
  })

  it('counts what is in scope, whatever becomes of it', () => {
    // The number that tells an empty chart apart from a chart of a thing you have never
    // done. "You squeezed from UTG six times" is fixed by lowering the threshold; "you have
    // never squeezed from UTG" is not, and without this they look identical.
    const { rows, hidden, inScope } = buildHandClassRows(
      many(6),
      { ...DEFAULT_FILTERS, minSample: 30 },
      DEFAULT_SCOPE,
      t
    )
    expect(rows).toEqual([])
    expect(hidden).toBe(1)
    expect(inScope).toBe(6)
  })

  it('counts decisions whose hole cards the history never showed', () => {
    // Hero's own cards are always dealt, so this should be zero on any real file. It is
    // counted rather than assumed, because a truncated file would otherwise just quietly
    // shrink every class and nothing would say so.
    const { rows, noCards } = buildHandClassRows(
      [...many(30, { deltaBB: 1 }), ...many(4, { cards: null })],
      { ...DEFAULT_FILTERS, minSample: 30 },
      DEFAULT_SCOPE,
      t
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].n).toBe(30)
    expect(noCards).toBe(4)
  })

  it('still honours the shared filters', () => {
    const situations = [
      ...many(40, { heroStackBB: 10, deltaBB: 5 }), // short
      ...many(40, { heroStackBB: 80, deltaBB: 1 }), // deep
    ]
    const short = buildHandClassRows(
      situations,
      { ...DEFAULT_FILTERS, stackBucket: 'short', minSample: 30 },
      DEFAULT_SCOPE,
      t
    ).rows
    expect(short).toHaveLength(1)
    expect(short[0].n).toBe(40)
    expect(short[0].mean).toBeCloseTo(5)
  })
})

describe('getHandClassProfitData', () => {
  it('names the action and position it is breaking down', () => {
    const { layout } = getHandClassProfitData(
      many(40),
      DEFAULT_FILTERS,
      { familyIndex: RFI, heroOffset: 0 },
      t
    )
    const title = (layout.title as { text: string }).text
    expect(title).toContain('chart.situation.family.rfi')
    expect(title).toContain('position.btn')
  })

  it('pins the row axis, like the ledger it sits beneath', () => {
    const { layout } = getHandClassProfitData(many(40), DEFAULT_FILTERS, DEFAULT_SCOPE, t)
    const l = layout as Record<string, { fixedrange?: boolean }>
    expect(l.yaxis.fixedrange).toBe(true)
    expect(l.xaxis.fixedrange).toBeUndefined()
  })

  it('defaults to breaking down the defence bucket, pooled across positions', () => {
    // The deepest bucket in a real sample, and the one whose average most needs opening up.
    // Also pins that the findIndex at module load actually found something: at -1 the chart
    // would be silently empty and the action dropdown would point at the wrong entry.
    expect(DEFAULT_SCOPE.familyIndex).toBeGreaterThanOrEqual(0)
    expect(FAMILIES[DEFAULT_SCOPE.familyIndex].key).toBe('chart.situation.family.flat')
    expect(DEFAULT_SCOPE.heroOffset).toBeNull()
  })

  it('still explains itself when it has no rows to draw', () => {
    // The caption is where the counts live, so it has to survive the empty state — that is
    // exactly when the reader needs to be told they have six of these, not zero.
    const { traces, caption } = getHandClassProfitData(
      many(6),
      { ...DEFAULT_FILTERS, minSample: 30 },
      DEFAULT_SCOPE,
      t
    )
    expect(traces).toEqual([])
    expect(caption.join('\n')).toContain('"inScope":6')
    expect(caption.join('\n')).toContain('"hidden":1')
  })
})
