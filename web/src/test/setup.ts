/**
 * Global vitest setup.
 *
 * Components call useTranslation(), which needs an initialized i18next instance.
 * Importing the module for its side effect gives every test the real locale data, so
 * tests exercise the same translation path as the app.
 */

import i18n from '../i18n'

// Pin the language rather than inheriting whatever the detector reads out of jsdom's
// navigator, so a test never depends on the environment's locale. Awaited, not
// fire-and-forget: a setup file whose whole point is determinism should not race.
await i18n.changeLanguage('en')
