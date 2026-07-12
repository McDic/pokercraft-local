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
import { withTranslation, type WithTranslation } from 'react-i18next'
import type { TranslationKey } from '../i18n'

interface OwnProps {
  children: ReactNode
  /** Which area failed, as a translation key, shown in the fallback. */
  labelKey?: TranslationKey
  /**
   * When any value in this array changes (shallow compare), the boundary clears
   * its error and re-attempts rendering its children. Pass the inputs that a
   * crash depended on (e.g. the loaded data) so replacing them recovers the UI
   * instead of leaving the fallback stuck until a full page reload.
   */
  resetKeys?: readonly unknown[]
}

type Props = OwnProps & WithTranslation

interface State {
  error: Error | null
  componentStack: string | null
}

// Must stay a class — only class components can implement getDerivedStateFromError.
// withTranslation() below supplies `t` and re-renders it on a language change.
class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null })
    // Keep a console copy for users grabbing logs from the deployed site. The key,
    // not the translation, so pasted logs read the same whatever the language.
    console.error(
      `[ErrorBoundary${this.props.labelKey ? ` ${this.props.labelKey}` : ''}]`,
      error,
      info.componentStack
    )
  }

  componentDidUpdate(prevProps: Props) {
    if (!this.state.error) return
    const prev = prevProps.resetKeys
    const next = this.props.resetKeys
    const changed =
      prev?.length !== next?.length ||
      !!next?.some((key, i) => !Object.is(key, prev?.[i]))
    if (changed) {
      this.setState({ error: null, componentStack: null })
    }
  }

  render() {
    const { error, componentStack } = this.state
    const { t, labelKey } = this.props
    if (error) {
      return (
        <div className="error-boundary" style={{ whiteSpace: 'pre-wrap' }}>
          <h3>
            {labelKey
              ? t('errorBoundary.titleIn', { label: t(labelKey) })
              : t('errorBoundary.title')}
          </h3>
          <p style={{ fontFamily: 'monospace' }}>{error.message || String(error)}</p>
          {componentStack && (
            <details open>
              <summary>{t('errorBoundary.componentStack')}</summary>
              <pre style={{ overflowX: 'auto' }}>{componentStack}</pre>
            </details>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner)
