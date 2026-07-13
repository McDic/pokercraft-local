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

/**
 * Every number Plotly is handed must be finite. A NaN or Infinity in a range makes it
 * fall back to a default axis, and `JSON.stringify` — which is how the HTML export
 * embeds the layout — silently turns both into `null`.
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

    const line = layout.shapes?.find(s => s.xref === 'x' && s.x0 === s.x1 && s.x0 !== 1)
    expect(line?.x0, 'the shape must stay in data coordinates').toBeCloseTo(1 / 8, 10)
  })
})

// The non-finite class is not specific to one chart: every builder derives axis bounds
// from the data, and a player with a thin or unlucky history is a real user.
describe('every tournament chart, on degenerate data', () => {
  const cases: Array<[string, () => { layout: object }]> = [
    ['no tournaments at all', () => getRRByRankData([], identityT)],
    ['nothing cashed', () => getRRByRankData([busted(1)], identityT)],
    ['a single tournament', () => getRRByRankData([cashed(1)], identityT)],
    ['historical: one tournament', () => getHistoricalPerformanceData([cashed(1)], identityT)],
    ['historical: nothing cashed', () => getHistoricalPerformanceData([busted(1)], identityT)],
    ['rre: nothing cashed', () => getRREHeatmapData([busted(1)], identityT)],
    ['prizes: nothing cashed', () => getPrizePiesData([busted(1)], identityT)],
    ['prizes: none at all', () => getPrizePiesData([], identityT)],
    ['bankroll: no results', () => getBankrollAnalysisData([], identityT)],
    ['bankroll: results', () => getBankrollAnalysisData(makeBankrollResults(0.5), identityT)],
  ]

  it.each(cases)('hands Plotly only finite numbers: %s', (_name, build) => {
    expect(nonFiniteNumbers(build().layout)).toEqual([])
  })
})
