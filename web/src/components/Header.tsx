/**
 * Application header component
 */

import { useTranslation } from 'react-i18next'
import { getVersionInfo } from '../utils/version'
import { LANGUAGES } from '../i18n'

interface HeaderProps {
  onExport?: () => void
}

export function Header({ onExport }: HeaderProps) {
  const { t, i18n } = useTranslation()
  const version = getVersionInfo(t)

  return (
    <header className="header">
      <div className="header-content">
        <h1>{t('app.title')}</h1>
        <span className="subtitle">{t('app.subtitle')}</span>
      </div>
      <div className="header-links">
        <select
          className="language-select"
          aria-label={t('header.language')}
          value={i18n.resolvedLanguage}
          onChange={e => i18n.changeLanguage(e.target.value)}
        >
          {LANGUAGES.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="export-button"
          onClick={onExport}
          disabled={!onExport}
          title={onExport ? t('header.export.tooltip') : t('header.export.tooltipDisabled')}
        >
          {t('header.export')}
        </button>
        <a
          href="https://github.com/McDic/pokercraft-local"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          {t('header.github')}
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
