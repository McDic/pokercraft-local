/**
 * Prize Pies Chart
 * Shows distribution of prizes by tournament and by weekday
 */

import type { TournamentSummary } from '../../types'
import { getTournamentTimeOfWeek } from '../../types'
import type { Data, Layout } from 'plotly.js-dist-min'

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

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
export function getPrizePiesData(tournaments: TournamentSummary[]): PrizePiesData {
  const totalPrizes = tournaments.reduce((sum, t) => sum + t.myPrize, 0)
  const threshold = totalPrizes * 0.01

  // Individual tournament prizes (group small ones as "Others")
  const mainTournaments = tournaments.filter(t => t.myPrize >= threshold)
  const othersPrize = tournaments
    .filter(t => t.myPrize < threshold)
    .reduce((sum, t) => sum + t.myPrize, 0)

  const pieLabels = [
    ...mainTournaments.map(t => formatTournamentName(t)),
    ...(othersPrize > 0 ? ['Others'] : []),
  ]
  const pieValues = [
    ...mainTournaments.map(t => t.myPrize),
    ...(othersPrize > 0 ? [othersPrize] : []),
  ]
  const piePulls = [
    ...mainTournaments.map(() => 0),
    ...(othersPrize > 0 ? [0.075] : []),
  ]

  // Prizes by weekday for sunburst
  const prizesByWeekday: Record<string, number> = {}
  for (const day of WEEKDAY_NAMES) {
    prizesByWeekday[day] = 0
  }

  const tournamentsByWeekday: Record<string, Array<{ name: string; prize: number }>> = {}
  for (const day of WEEKDAY_NAMES) {
    tournamentsByWeekday[day] = []
  }

  for (const t of tournaments) {
    const [dayIdx] = getTournamentTimeOfWeek(t)
    const dayName = WEEKDAY_NAMES[dayIdx]
    prizesByWeekday[dayName] += t.myPrize
    tournamentsByWeekday[dayName].push({
      name: formatTournamentName(t),
      prize: t.myPrize,
    })
  }

  // Build sunburst data
  const sunburstLabels: string[] = []
  const sunburstParents: string[] = []
  const sunburstValues: number[] = []

  for (const day of WEEKDAY_NAMES) {
    if (prizesByWeekday[day] <= 0) continue

    // Add weekday node
    sunburstLabels.push(day)
    sunburstParents.push('')
    sunburstValues.push(prizesByWeekday[day])

    // Add tournaments under this weekday (only significant ones)
    const dayTournaments = tournamentsByWeekday[day].filter(
      t => t.prize >= threshold * 0.5
    )
    for (const t of dayTournaments) {
      sunburstLabels.push(t.name)
      sunburstParents.push(day)
      sunburstValues.push(t.prize)
    }
  }

  const traces: Data[] = [
    {
      type: 'pie',
      labels: pieLabels,
      values: pieValues,
      pull: piePulls,
      name: 'Individual Prizes',
      hovertemplate: '%{label}: %{value:$,.2f}',
      domain: { row: 0, column: 0 },
      showlegend: false,
    } as Data,
    {
      type: 'sunburst',
      labels: sunburstLabels,
      parents: sunburstParents,
      values: sunburstValues,
      maxdepth: 2,
      name: 'Prizes by Weekday',
      hovertemplate: '%{label}: %{value:$,.2f}',
      domain: { row: 1, column: 0 },
    } as Data,
  ]

  const layout: Partial<Layout> = {
    title: {
      text: 'Prize Distribution',
      subtitle: { text: 'Individual tournaments and by weekday' },
    },
    height: 800,
    grid: {
      rows: 2,
      columns: 1,
    },
    annotations: [
      {
        text: 'Individual Prizes',
        x: 0.5,
        y: 0.85,
        xref: 'paper',
        yref: 'paper',
        showarrow: false,
        font: { size: 14, weight: 700 },
      },
      {
        text: 'Prizes by Weekday',
        x: 0.5,
        y: 0.35,
        xref: 'paper',
        yref: 'paper',
        showarrow: false,
        font: { size: 14, weight: 700 },
      },
    ],
  }

  return { traces, layout }
}
