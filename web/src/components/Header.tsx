/**
 * Application header component
 */

import { getVersionInfo } from '../utils/version'

interface HeaderProps {
  onExport?: () => void
}

export function Header({ onExport }: HeaderProps) {
  const version = getVersionInfo()

  return (
    <header className="header">
      <div className="header-content">
        <h1>Pokercraft Local</h1>
        <span className="subtitle">Poker Analytics Dashboard</span>
      </div>
      <div className="header-links">
        <button
          className="export-button"
          onClick={onExport}
          disabled={!onExport}
          title={onExport ? 'Export the active tab\'s charts as HTML' : 'Load data to enable export'}
        >
          Export HTML
        </button>
        <a
          href="https://github.com/McDic/pokercraft-local"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          GitHub
        </a>
        <span className="version">
          {version.url ? (
            <a
              href={version.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {version.text}
            </a>
          ) : (
            version.text
          )}
        </span>
      </div>
    </header>
  )
}
