/**
 * Tab navigation for chart sections.
 *
 * A tab is disabled until the data it needs is loaded, and carries a hover tooltip (a CSS
 * `::after`, see App.css) saying which data is missing — a native `title` does not reliably show
 * on a disabled <button>.
 */

import { useTranslation } from 'react-i18next'
import type { TranslationKey } from '../i18n'

export type ChartTab = 'tournament' | 'handHistory' | 'situation' | 'deepDive'

interface ChartTabsProps {
  activeTab: ChartTab
  onTabChange: (tab: ChartTab) => void
  tournamentCount: number
  handHistoryCount: number
}

export function ChartTabs({
  activeTab,
  onTabChange,
  tournamentCount,
  handHistoryCount,
}: ChartTabsProps) {
  const { t } = useTranslation()
  const hasTournaments = tournamentCount > 0
  const hasHandHistories = handHistoryCount > 0
  // Deep Dive joins both datasets, so it needs both present.
  const hasBoth = hasTournaments && hasHandHistories

  if (!hasTournaments && !hasHandHistories) {
    return null
  }

  const tabs: Array<{
    id: ChartTab
    icon: string
    labelKey: TranslationKey
    enabled: boolean
    /** Count badge, or null for none. */
    count: number | null
    /** Shown on hover while the tab is disabled. */
    disabledTooltipKey: TranslationKey
  }> = [
    {
      id: 'tournament',
      icon: '🏆',
      labelKey: 'tabs.tournament',
      enabled: hasTournaments,
      count: hasTournaments ? tournamentCount : null,
      disabledTooltipKey: 'tabs.tournamentDisabledTooltip',
    },
    {
      id: 'handHistory',
      icon: '🃏',
      labelKey: 'tabs.handHistory',
      enabled: hasHandHistories,
      count: hasHandHistories ? handHistoryCount : null,
      disabledTooltipKey: 'tabs.handHistoryDisabledTooltip',
    },
    {
      id: 'situation',
      icon: '🎯',
      labelKey: 'tabs.situation',
      enabled: hasHandHistories,
      count: hasHandHistories ? handHistoryCount : null,
      // Same data requirement as the hand-history tab.
      disabledTooltipKey: 'tabs.handHistoryDisabledTooltip',
    },
    {
      id: 'deepDive',
      icon: '🤿',
      labelKey: 'tabs.deepDive',
      enabled: hasBoth,
      count: null,
      disabledTooltipKey: 'tabs.deepDiveDisabledTooltip',
    },
  ]

  return (
    <nav className="chart-tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`tab ${activeTab === tab.id ? 'active' : ''} ${!tab.enabled ? 'disabled' : ''}`}
          onClick={() => tab.enabled && onTabChange(tab.id)}
          // `aria-disabled` rather than `disabled`, so a disabled tab stays focusable: keyboard and
          // screen-reader users can reach it and hear why it is inert. The visual tooltip is the CSS
          // `data-tooltip` (shown on hover and focus); `aria-label` carries the same reason to AT.
          aria-disabled={!tab.enabled || undefined}
          aria-label={!tab.enabled ? `${t(tab.labelKey)} — ${t(tab.disabledTooltipKey)}` : undefined}
          data-tooltip={!tab.enabled ? t(tab.disabledTooltipKey) : undefined}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{t(tab.labelKey)}</span>
          {tab.count !== null && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </nav>
  )
}
