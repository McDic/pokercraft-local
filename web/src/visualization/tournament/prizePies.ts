/**
 * Prize Pies Chart
 * Shows distribution of prizes by tournament and by weekday
 */

import type { TournamentSummary } from '../../types'
import { getTournamentTimeOfWeek } from '../../types'
import type { Translate, TranslationKey } from '../../i18n'
import type { Data, Layout } from 'plotly.js-dist-min'

/**
 * Weekday order, as translation keys. The sunburst links children to parents by
 * matching label strings, so the *translated* name is used for both the node and
 * its children's `parents` entry — never mix a translated label with an English one.
 */
const WEEKDAY_KEYS = [
  'chart.prizePies.weekday.mon',
  'chart.prizePies.weekday.tue',
  'chart.prizePies.weekday.wed',
  'chart.prizePies.weekday.thu',
  'chart.prizePies.weekday.fri',
  'chart.prizePies.weekday.sat',
  'chart.prizePies.weekday.sun',
] as const satisfies readonly TranslationKey[]

export interface PrizePiesData {
  traces: Data[]
  layout: Partial<Layout>
}

/**
 * Format tournament name with date
 */
function formatTournamentName(t: TournamentSummary): string {
  const dateStr = t.startTime.toISOString().slice(0, 10).replace(/-/g, '')
  return `${t.name} (${dateStr})`
}

/**
 * Generate prize pies chart data
 */
export function getPrizePiesData(tournaments: TournamentSummary[], t: Translate): PrizePiesData {
  const totalPrizes = tournaments.reduce((sum, tour) => sum + tour.myPrize, 0)
  const threshold = totalPrizes * 0.01

  // Weekday labels in the active language, indexed the same way as WEEKDAY_KEYS.
  const weekdayNames = WEEKDAY_KEYS.map(key => t(key))

  // Individual tournament prizes (group small ones as "Others")
  const mainTournaments = tournaments.filter(tour => tour.myPrize >= threshold)
  const othersPrize = tournaments
    .filter(tour => tour.myPrize < threshold)
    .reduce((sum, tour) => sum + tour.myPrize, 0)

  const pieLabels = [
    ...mainTournaments.map(tour => formatTournamentName(tour)),
    ...(othersPrize > 0 ? [t('chart.prizePies.others')] : []),
  ]
  const pieValues = [
    ...mainTournaments.map(tour => tour.myPrize),
    ...(othersPrize > 0 ? [othersPrize] : []),
  ]
  const piePulls = [
    ...mainTournaments.map(() => 0),
    ...(othersPrize > 0 ? [0.075] : []),
  ]

  // Prizes by weekday for sunburst, bucketed by weekday index rather than by name
  // so the grouping never depends on the active language.
  const prizesByWeekday = WEEKDAY_KEYS.map(() => 0)
  const tournamentsByWeekday: Array<Array<{ name: string; prize: number }>> = WEEKDAY_KEYS.map(
    () => []
  )

  for (const tour of tournaments) {
    const [dayIdx] = getTournamentTimeOfWeek(tour)
    prizesByWeekday[dayIdx] += tour.myPrize
    tournamentsByWeekday[dayIdx].push({
      name: formatTournamentName(tour),
      prize: tour.myPrize,
    })
  }

  // Build sunburst data
  const sunburstLabels: string[] = []
  const sunburstParents: string[] = []
  const sunburstValues: number[] = []

  for (let dayIdx = 0; dayIdx < WEEKDAY_KEYS.length; dayIdx++) {
    if (prizesByWeekday[dayIdx] <= 0) continue

    // Add weekday node
    const dayName = weekdayNames[dayIdx]
    sunburstLabels.push(dayName)
    sunburstParents.push('')
    sunburstValues.push(prizesByWeekday[dayIdx])

    // Add tournaments under this weekday (only significant ones)
    const dayTournaments = tournamentsByWeekday[dayIdx].filter(
      tour => tour.prize >= threshold * 0.5
    )
    for (const tour of dayTournaments) {
      sunburstLabels.push(tour.name)
      sunburstParents.push(dayName)
      sunburstValues.push(tour.prize)
    }
  }

  const traces: Data[] = [
    {
      type: 'pie',
      labels: pieLabels,
      values: pieValues,
      pull: piePulls,
      name: t('chart.prizePies.legend.individual'),
      hovertemplate: '%{label}: %{value:$,.2f}',
      domain: { x: [0, 0.48], y: [0, 1] },
      showlegend: false,
    } as Data,
    {
      type: 'sunburst',
      labels: sunburstLabels,
      parents: sunburstParents,
      values: sunburstValues,
      maxdepth: 2,
      name: t('chart.prizePies.legend.byWeekday'),
      hovertemplate: '%{label}: %{value:$,.2f}',
      domain: { x: [0.52, 1], y: [0, 1] },
    } as Data,
  ]

  const layout: Partial<Layout> = {
    title: {
      text: t('chart.prizePies.title'),
      subtitle: { text: t('chart.prizePies.subtitle') },
    },
    height: 500,
    annotations: [
      {
        text: t('chart.prizePies.annotation.individual'),
        x: 0.24,
        y: 1.05,
        xref: 'paper',
        yref: 'paper',
        showarrow: false,
        font: { size: 14 },
      },
      {
        text: t('chart.prizePies.annotation.byWeekday'),
        x: 0.76,
        y: 1.05,
        xref: 'paper',
        yref: 'paper',
        showarrow: false,
        font: { size: 14 },
      },
    ],
  }

  return { traces, layout }
}
