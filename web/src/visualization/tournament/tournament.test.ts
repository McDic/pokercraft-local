import { describe, it, expect } from 'vitest'
import { getRRByRankData } from './rrByRank'
import { getHistoricalPerformanceData } from './historicalPerformance'
import { getRREHeatmapData } from './rreHeatmap'
import { getPrizePiesData } from './prizePies'
import { getBankrollAnalysisData } from './bankrollAnalysis'
import { makeTournament, makeBankrollResults } from '../../test/fixtures'
import { identityT } from '../../test/i18n'

/** A tournament the player cashed in: rank 1 of 100, prize well above the buy-in. */
const cashed = (id: number) => makeTournament(id)

/** A tournament the player busted out of: no prize, so no RR to plot. */
const busted = (id: number) =>
  makeTournament(id, { myRank: 60, totalPlayers: 100, myPrize: 0 })

/** Corrupt: a zero-player field, so `myRank / totalPlayers` is not a number. */
const noPlayers = (id: number) => makeTournament(id, { totalPlayers: 0 })

/**
 * Every number in a *layout* must be finite. A NaN or Infinity in an axis range makes
 * Plotly fall back to a default axis, and `JSON.stringify` — which is how the HTML export
 * embeds the layout — silently turns both into `null`.
 *
 * Layouts only, deliberately: NaN is legal in *trace* data, where Plotly reads it as a
 * gap. `getRREHeatmapData` emits it on purpose, for a zero RRE.
 */
function nonFiniteNumbers(value: unknown, path = ''): string[] {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? [] : [`${path} = ${value}`]
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => nonFiniteNumbers(v, `${path}[${i}]`))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      nonFiniteNumbers(v, path ? `${path}.${k}` : k)
    )
  }
  return []
}

describe('getRRByRankData', () => {
  it('plots the tournaments that cashed', () => {
    const { traces, layout } = getRRByRankData([cashed(1), cashed(2), busted(3)], identityT)

    expect(traces.length).toBeGreaterThan(0)
    expect(layout.title).toEqual({ text: 'chart.rrByRank.title' })
  })

  // Regression: with nothing to plot, `minPercentile` stayed at its Infinity sentinel and
  // the x-axis range came out as [0, Infinity] — a blank plot with a nonsense axis rather
  // than the "no data" state every other builder shows, and [0, null] in the export.
  it('shows a no-data state instead of an infinite axis when nothing cashed', () => {
    const { traces, layout } = getRRByRankData([busted(1), busted(2)], identityT)

    expect(traces).toEqual([])
    expect(layout.annotations?.[0]).toMatchObject({ text: 'chart.rrByRank.noData' })
    expect(nonFiniteNumbers(layout)).toEqual([])
  })

  // Regression: on a log axis Plotly reads a shape's coordinates as data but an
  // annotation's as log10. The ITM label was passed 1/8 raw, which put it at 10^0.125 —
  // outside the axis range, so it never rendered. The shape beside it is correct as-is.
  it('places the ITM-cut label in log10 coordinates, and its line in data coordinates', () => {
    const { layout } = getRRByRankData([cashed(1), cashed(2)], identityT)

    const label = layout.annotations?.find(a => a.text === 'chart.rrByRank.annotation.itmCut')
    expect(label?.xref).toBe('x')
    expect(label?.x).toBeCloseTo(Math.log10(1 / 8), 10)

    const line = layout.shapes?.find(s => s.name === 'itm-cut')
    expect(line?.x0, 'the shape must stay in data coordinates').toBeCloseTo(1 / 8, 10)
  })
})

// The non-finite class is not specific to one chart: every builder derives its axis bounds
// from the data, and a player with a thin, unlucky, or corrupt history is a real user. So
// the list below is every builder against every degenerate input, not the subset that
// happens to pass — `historical: none at all` and the zero-player cases were both added
// because they FAILED.
describe('every tournament chart, on degenerate data', () => {
  const cases: Array<[string, () => { traces: unknown[]; layout: object }]> = [
    ['rrByRank: none at all', () => getRRByRankData([], identityT)],
    ['rrByRank: nothing cashed', () => getRRByRankData([busted(1)], identityT)],
    ['rrByRank: a single tournament', () => getRRByRankData([cashed(1)], identityT)],
    ['rrByRank: zero-player field', () => getRRByRankData([noPlayers(1)], identityT)],
    [
      'rrByRank: one good, one corrupt',
      () => getRRByRankData([cashed(1), noPlayers(2)], identityT),
    ],
    ['historical: none at all', () => getHistoricalPerformanceData([], identityT)],
    ['historical: one tournament', () => getHistoricalPerformanceData([cashed(1)], identityT)],
    ['historical: nothing cashed', () => getHistoricalPerformanceData([busted(1)], identityT)],
    ['rre: none at all', () => getRREHeatmapData([], identityT)],
    ['rre: nothing cashed', () => getRREHeatmapData([busted(1)], identityT)],
    ['prizes: none at all', () => getPrizePiesData([], identityT)],
    ['prizes: nothing cashed', () => getPrizePiesData([busted(1)], identityT)],
    ['bankroll: no results', () => getBankrollAnalysisData([], identityT)],
  ]

  it.each(cases)('hands Plotly a finite layout: %s', (_name, build) => {
    expect(nonFiniteNumbers(build().layout)).toEqual([])
  })

  // A NaN in trace `y` is a gap, which is fine. An Infinity in trace `x` is not — it is a
  // coordinate Plotly cannot place, and the export writes it out as `null`.
  it.each(cases)('plots no infinite coordinate: %s', (_name, build) => {
    const infinite = build()
      .traces.flatMap((trace, i) =>
        nonFiniteNumbers((trace as { x?: unknown }).x, `traces[${i}].x`)
      )
      .filter(v => v.includes('Infinity'))
    expect(infinite).toEqual([])
  })
})

// The happy path, kept out of the degenerate block above so that block means what it says.
describe('getBankrollAnalysisData', () => {
  it('hands Plotly a finite layout for a real simulation', () => {
    expect(
      nonFiniteNumbers(getBankrollAnalysisData(makeBankrollResults(0.5), identityT).layout)
    ).toEqual([])
  })
})
