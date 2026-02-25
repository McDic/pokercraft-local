/**
 * Application header component
 */

interface HeaderProps {
  wasmVersion: string
  onExport?: () => void
}

export function Header({ wasmVersion, onExport }: HeaderProps) {
  const appVersion = __APP_VERSION__
  const gitHash = __GIT_HASH__

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
          title={onExport ? 'Export all charts as HTML' : 'Load data to enable export'}
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
          v{appVersion}
          {gitHash && gitHash !== 'unknown' && ` (${gitHash})`}
          {wasmVersion && ` | WASM v${wasmVersion}`}
        </span>
      </div>
    </header>
  )
}
