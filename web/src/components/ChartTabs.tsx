/**
 * Tab navigation for chart sections
 */

import { useTranslation } from 'react-i18next'

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
  // The Deep Dive tab joins both datasets, so it stays inert until both are present.
  const hasBoth = hasTournaments && hasHandHistories

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
      <button
        className={`tab ${activeTab === 'situation' ? 'active' : ''} ${!hasHandHistories ? 'disabled' : ''}`}
        onClick={() => hasHandHistories && onTabChange('situation')}
        disabled={!hasHandHistories}
      >
        <span className="tab-icon">🎯</span>
        <span className="tab-label">{t('tabs.situation')}</span>
        {hasHandHistories && <span className="tab-count">{handHistoryCount}</span>}
      </button>
      <button
        className={`tab ${activeTab === 'deepDive' ? 'active' : ''} ${!hasBoth ? 'disabled' : ''}`}
        onClick={() => hasBoth && onTabChange('deepDive')}
        disabled={!hasBoth}
      >
        <span className="tab-icon">🤿</span>
        <span className="tab-label">{t('tabs.deepDive')}</span>
      </button>
    </nav>
  )
}
