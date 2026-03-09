/**
 * Application header component
 */

interface HeaderProps {
  onExport?: () => void
}

export function Header({ onExport }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-content">
        <h1>ggsession</h1>
        <span className="subtitle">Daily sessions, session totals, and one clean tournament ledger</span>
      </div>
      <div className="header-links">
        {onExport && (
          <button
            className="export-button"
            onClick={onExport}
            title="Export current report"
          >
            Export
          </button>
        )}
      </div>
    </header>
  )
}
