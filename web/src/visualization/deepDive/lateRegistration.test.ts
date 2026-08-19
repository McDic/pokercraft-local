import { describe, it, expect } from 'vitest'
import { getLateRegistrationData } from './lateRegistration'
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
  it('quarantines level-1 entries into the on-time row, whatever their depth', () => {
    const figure = getLateRegistrationData(
      // A 12 BB level-1 entry is a shallow-start format, not a late registration — it must
      // land in the on-time row, never in the "<15" bucket.
      resultOf([entry(12, -1, -10, 1), entry(150, 0.5, 5, 1), entry(12, -1, -10)]),
      identityT
    )
    expect(rowLabels(figure.layout)).toEqual([
      'deepDive.lateReg.onTimeLabel({"n":2})',
      'deepDive.lateReg.rowLabel({"range":"<15","n":1})',
    ])
  })

  it('buckets late entries by depth, deepest first, and skips empty buckets', () => {
    const figure = getLateRegistrationData(
      // 100 lands in "100+" (bounds are inclusive below), 15 in "15–25", 14.9 in "<15";
      // nothing between 25 and 100 and nothing on time, so those rows must not appear.
      resultOf([entry(100, 0.5, 5), entry(15, -1, -10), entry(14.9, -1, -10)]),
      identityT
    )
    expect(rowLabels(figure.layout)).toEqual([
      'deepDive.lateReg.rowLabel({"range":"100+","n":1})',
      'deepDive.lateReg.rowLabel({"range":"15–25","n":1})',
      'deepDive.lateReg.rowLabel({"range":"<15","n":1})',
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
