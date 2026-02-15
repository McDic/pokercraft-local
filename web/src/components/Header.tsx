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
      {wasmVersion && (
        <span className="version">WASM v{wasmVersion}</span>
      )}
    </header>
  )
}
