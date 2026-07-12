/**
 * Test helpers for the chart builders' `t` parameter.
 */

import type { Translate } from '../i18n'

/**
 * A translator that returns the key it was handed.
 *
 * Chart tests assert on the *key* rather than on English prose, so they keep
 * passing when the wording changes and actually pin down which key each label is
 * built from — which the old hardcoded-English assertions could not do.
 */
export const identityT = ((key: string) => key) as unknown as Translate
