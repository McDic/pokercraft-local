/**
 * Application header component
 */

interface HeaderProps {
  wasmVersion: string
}

export function Header({ wasmVersion }: HeaderProps) {
  const appVersion = __APP_VERSION__
  const gitHash = __GIT_HASH__

  return (
    <header className="header">
      <div className="header-content">
        <h1>Pokercraft Local</h1>
        <span className="subtitle">Poker Analytics Dashboard</span>
      </div>
      <div className="header-links">
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
