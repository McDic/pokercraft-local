/**
 * Global vitest setup.
 *
 * Components call useTranslation(), which needs an initialized i18next instance.
 * Importing the module for its side effect gives every test the real locale data,
 * so tests exercise the same translation path as the app.
 */

import '../i18n'
