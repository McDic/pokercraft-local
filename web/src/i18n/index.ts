/**
 * i18n setup.
 *
 * Translations live in `locales/<lang>.json` as flat, dot-separated keys
 * (Minecraft resource-pack style) so that translators can contribute a language
 * by editing one JSON file and never touching TypeScript. See locales/README.md.
 */

import i18n from 'i18next'
import type { TFunction } from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en.json'
import ko from './locales/ko.json'

/**
 * Every supported language, in the order shown in the switcher.
 *
 * This is the ONE place a language is registered: the switcher, i18next's
 * `resources`, `supportedLngs`, and the locale test all derive from it, so adding
 * a language really is the single line the translator guide promises.
 *
 * `label` is the language's name in itself — a reader who cannot read the current
 * language still has to be able to find their own.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', translation: en },
  { code: 'ko', label: '한국어', translation: ko },
] as const

export type Language = (typeof LANGUAGES)[number]['code']

export const LANGUAGE_CODES = LANGUAGES.map(l => l.code)

const resources = Object.fromEntries(
  LANGUAGES.map(({ code, translation }) => [code, { translation }])
)

/** Every key defined in en.json. Anything else is a compile error. */
export type TranslationKey = keyof typeof en

/**
 * The translator handed to chart builders.
 *
 * Chart builders take this as a parameter rather than importing the i18n
 * singleton: it keeps them pure, lets tests pass a stub without booting
 * i18next, and avoids coupling `visualization/` to app startup.
 */
export type Translate = TFunction<'translation'>

/** Where the chosen language is remembered across visits. */
const STORAGE_KEY = 'pokercraft-language'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: LANGUAGE_CODES,
    fallbackLng: 'en',
    // Fold regional variants: a `ko-KR` browser resolves to `ko`.
    load: 'languageOnly',

    // Keys are flat strings that happen to contain dots ("chart.rrByRank.title").
    // Without disabling both separators i18next would read that as a path into a
    // nested object and find nothing.
    keySeparator: false,
    nsSeparator: false,

    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },

    interpolation: {
      // React escapes what it renders, and Plotly needs the raw `<b>` tags that
      // some annotations carry, so i18next must not escape on top of that.
      escapeValue: false,
    },

    react: {
      // Resources are bundled, so they are ready the moment this module is
      // imported. Suspending would only force every caller to own a boundary.
      useSuspense: false,
    },
  })

/** Keep the document language in sync so screen readers announce the right voice. */
function syncDocumentLanguage(lng: string): void {
  // Guarded: this module is also imported by non-DOM contexts (Node-based tests).
  if (typeof document === 'undefined') return
  document.documentElement.lang = lng
}

syncDocumentLanguage(i18n.resolvedLanguage ?? 'en')
i18n.on('languageChanged', syncDocumentLanguage)

export default i18n
