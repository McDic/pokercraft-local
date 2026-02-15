/**
 * Application header component
 */

interface HeaderProps {
  wasmVersion: string
}

export function Header({ wasmVersion }: HeaderProps) {
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
        {wasmVersion && (
          <span className="version">WASM v{wasmVersion}</span>
        )}
      </div>
    </header>
  )
}
