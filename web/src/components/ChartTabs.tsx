/**
 * Tab navigation for chart sections
 */

import { useTranslation } from 'react-i18next'

export type ChartTab = 'tournament' | 'handHistory'

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

  if (!hasTournaments && !hasHandHistories) {
    return null
  }

  return (
    <nav className="chart-tabs">
      <button
        className={`tab ${activeTab === 'tournament' ? 'active' : ''} ${!hasTournaments ? 'disabled' : ''}`}
        onClick={() => hasTournaments && onTabChange('tournament')}
        disabled={!hasTournaments}
      >
        <span className="tab-icon">🏆</span>
        <span className="tab-label">{t('tabs.tournament')}</span>
        {hasTournaments && <span className="tab-count">{tournamentCount}</span>}
      </button>
      <button
        className={`tab ${activeTab === 'handHistory' ? 'active' : ''} ${!hasHandHistories ? 'disabled' : ''}`}
        onClick={() => hasHandHistories && onTabChange('handHistory')}
        disabled={!hasHandHistories}
      >
        <span className="tab-icon">🃏</span>
        <span className="tab-label">{t('tabs.handHistory')}</span>
        {hasHandHistories && <span className="tab-count">{handHistoryCount}</span>}
      </button>
    </nav>
  )
}
