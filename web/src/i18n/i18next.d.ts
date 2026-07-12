/**
 * Types the `t()` function against en.json, so an unknown or misspelled key is a
 * compile error rather than a string that silently renders as itself.
 */

import type en from './locales/en.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    keySeparator: false
    nsSeparator: false
    defaultNS: 'translation'
    resources: {
      translation: typeof en
    }
  }
}
