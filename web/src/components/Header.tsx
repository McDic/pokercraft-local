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
        <img
          className="brand-mark"
          src={`${import.meta.env.BASE_URL}gs_header.png`}
          alt="ggsession"
        />
        <span className="subtitle">Daily sessions, session totals, and one clean tournament view</span>
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
