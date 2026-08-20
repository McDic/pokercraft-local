import { describe, it, expect } from 'vitest'
import { getLateRegistrationData, getLateRegHeatmapData } from './lateRegistration'
import type { LateRegEntry, LateRegResult } from '../../analysis/lateRegistration'
import { identityT } from '../../test/i18n'
import type { Layout } from 'plotly.js-dist-min'

function entry(stackBB: number, rr: number, profitUsd: number, level = 3): LateRegEntry {
  return {
    tournamentId: 1,
    entryIndex: 0,
    totalEntries: 1,
    stackBB,
    minutesLate: 10,
    level,
    rr,
    profitUsd,
    buyIn: 10,
  }
}

function resultOf(entries: LateRegEntry[]): LateRegResult {
  return { entries, joinedTournaments: entries.length, skippedMismatch: 0 }
}

/** The row labels the figure draws, top-down, straight from the y-axis ticks. */
function rowLabels(layout: Partial<Layout>): string[] {
  return (layout.yaxis as { ticktext: string[] }).ticktext
}

describe('getLateRegistrationData', () => {
  it('buckets every entry by depth alone — a level-1 hyper and a late entry share a band', () => {
    // Hyper-bounty formats (e.g. Speed Racer) start level 1 at 10–25 BB, so blind level
    // cannot separate "on time" from "late"; depth is the axis, and level only rides along
    // in the hover. The 12 BB level-1 entry and the 12 BB level-3 entry land together.
    const figure = getLateRegistrationData(
      resultOf([entry(12, -1, -10, 1), entry(150, 0.5, 5, 1), entry(12, -1, -10)]),
      identityT
    )
    expect(rowLabels(figure.layout)).toEqual([
      'deepDive.lateReg.rowLabel({"range":"128+","n":1})',
      'deepDive.lateReg.rowLabel({"range":"<16","n":2})',
    ])
  })

  it('orders rows deepest first and skips empty bands', () => {
    // 128 lands in "128+" (bounds are inclusive below), 16 in "16–32", 15.9 in "<16";
    // nothing between 32 and 128, so those rows must not appear.
    const figure = getLateRegistrationData(
      resultOf([entry(128, 0.5, 5), entry(16, -1, -10), entry(15.9, -1, -10)]),
      identityT
    )
    expect(rowLabels(figure.layout)).toEqual([
      'deepDive.lateReg.rowLabel({"range":"128+","n":1})',
      'deepDive.lateReg.rowLabel({"range":"16–32","n":1})',
      'deepDive.lateReg.rowLabel({"range":"<16","n":1})',
    ])
  })

  it('averages relative returns on the left panel but sums dollars on the right', () => {
    const figure = getLateRegistrationData(
      // Same bucket: rr mean is (2 + −1) / 2, while the money panel must add the
      // USD amounts, not the returns — buy-ins differ across tournaments.
      resultOf([entry(50, 2, 200), entry(50, -1, -10)]),
      identityT
    )
    // Both entries fall in one bucket, and n = 2 with a wide interval means one grey trace
    // pair: [0] is the mean scatter, [1] the total bar.
    const [mean, total] = figure.traces as Array<{ x: number[] }>
    expect(mean.x).toEqual([0.5])
    expect(total.x).toEqual([190])
  })

  it('speaks ROI, not Δbb: axes and hover come from the deepDive keys', () => {
    const figure = getLateRegistrationData(resultOf([entry(50, 0.5, 5)]), identityT)
    const layout = figure.layout as {
      xaxis: { title: { text: string } }
      xaxis2: { title: { text: string } }
    }
    expect(layout.xaxis.title.text).toBe('deepDive.lateReg.axis.mean')
    expect(layout.xaxis2.title.text).toBe('deepDive.lateReg.axis.total')
    const [mean] = figure.traces as Array<{ hovertemplate: string }>
    expect(mean.hovertemplate).toBe('deepDive.lateReg.hover.mean')
  })
})

interface HeatmapTrace {
  x: string[]
  y: string[]
  z: number[][]
  customdata: Array<Array<[number, number]>>
}

describe('getLateRegHeatmapData', () => {
  it('bins busts into their own column and returns into log-2 columns up to 128×+', () => {
    const hm = getLateRegHeatmapData(
      // <16 band: one bust, one 0.4× return. 64–128 band: an exact 1× (break-even) and a
      // 200× — the tail column exists precisely because a few such scores drive the profit.
      resultOf([entry(12, -1, -10), entry(12, -0.6, -6), entry(100, 0, 0), entry(100, 199, 1990)]),
      identityT
    )
    const trace = hm.traces[0] as unknown as HeatmapTrace

    expect(trace.x[0]).toBe('deepDive.lateReg.heatmap.bust')
    expect(trace.x[trace.x.length - 1]).toBe('128×+')
    // Only the two non-empty depth bands survive, shallowest first (drawn at the bottom).
    expect(trace.y).toEqual([
      'deepDive.lateReg.rowLabel({"range":"<16","n":2})',
      'deepDive.lateReg.rowLabel({"range":"64–128","n":2})',
    ])
    // <16 row: the bust in column 0, the 0.4× in "0.25–0.5×" (column 2).
    expect(trace.customdata[0][0]).toEqual([1, 0.5])
    expect(trace.customdata[0][2]).toEqual([1, 0.5])
    // 64–128 row: 1× is not a bust — it lands in "1–2×" (column 4); 200× in the last column.
    expect(trace.customdata[1][4]).toEqual([1, 0.5])
    expect(trace.customdata[1][trace.x.length - 1]).toEqual([1, 0.5])
  })

  it('normalises each row to its own total and colours by the square root', () => {
    const hm = getLateRegHeatmapData(
      resultOf([entry(20, -1, -10), entry(20, -1, -10), entry(20, -1, -10), entry(20, 1, 10)]),
      identityT
    )
    const trace = hm.traces[0] as unknown as HeatmapTrace

    expect(trace.y).toEqual(['deepDive.lateReg.rowLabel({"range":"16–32","n":4})'])
    const shares = trace.customdata[0].map(([, share]) => share)
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(trace.customdata[0][0]).toEqual([3, 0.75])
    expect(trace.z[0][0]).toBeCloseTo(Math.sqrt(0.75))
  })
})
