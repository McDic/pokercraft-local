/**
 * Test helpers for the chart builders' `t` parameter.
 */

import type { Translate } from '../i18n'

/**
 * A translator that echoes the key it was handed, plus any values.
 *
 * Chart tests assert on the *key* rather than on English prose, so they keep passing
 * when the wording changes and actually pin down which key each label is built from —
 * which the old hardcoded-English assertions could not do.
 *
 * The values are folded into the output rather than dropped, so a call site that
 * passes the wrong placeholder name (`{ initialCapital }` where the key declares
 * `{{capital}}`) is visible to a test. The type system cannot catch that: it checks
 * the key, not the names inside the string.
 */
export const identityT = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}(${JSON.stringify(values)})` : key) as unknown as Translate
