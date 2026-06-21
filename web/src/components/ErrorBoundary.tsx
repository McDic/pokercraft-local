/**
 * Error boundary that contains render-time crashes.
 *
 * Without a boundary, any uncaught exception during render unmounts the whole
 * React tree, leaving only the dark page background (a "full black" screen).
 * This catches the error, keeps the rest of the app usable, and shows the
 * message plus component stack so the failing component can be identified —
 * which is otherwise invisible in production, where React only emits a minified
 * error code (e.g. #130).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Short label for which area failed, shown in the fallback. */
  label?: string
}

interface State {
  error: Error | null
  componentStack: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null })
    // Keep a console copy for users grabbing logs from the deployed site.
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info.componentStack)
  }

  render() {
    const { error, componentStack } = this.state
    if (error) {
      return (
        <div className="error-boundary" style={{ padding: '1rem', whiteSpace: 'pre-wrap' }}>
          <h3>Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}.</h3>
          <p style={{ fontFamily: 'monospace' }}>{error.message || String(error)}</p>
          {componentStack && (
            <details open>
              <summary>Component stack</summary>
              <pre style={{ overflowX: 'auto' }}>{componentStack}</pre>
            </details>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
