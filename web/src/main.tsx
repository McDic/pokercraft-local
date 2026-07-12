import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Side-effect import: initializes i18next before any component calls t().
import './i18n'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary labelKey="errorBoundary.label.app">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
