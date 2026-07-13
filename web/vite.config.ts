// From 'vitest/config', not 'vite': the plain defineConfig does not accept `test`.
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'

// Get git commit hash at build time
function getGitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// Get git commit timestamp (Unix seconds) at build time
function getGitTimestamp(): number {
  try {
    return parseInt(execSync('git log -1 --format=%ct HEAD').toString().trim(), 10)
  } catch {
    return 0
  }
}

/**
 * Bundles `src/export/situationRuntime.ts` and hands it to the app as a **string**, under the
 * import id `virtual:situation-runtime`.
 *
 * The exported HTML file has working filter dropdowns, so it has to carry real code — and the
 * only honest way to give it the app's aggregation is to give it *the app's aggregation*,
 * compiled. A hand-written second copy in a template string would drift from the originals,
 * and would do it silently: a chart that scores significance by a stale rule still looks like
 * a chart. So the runtime is bundled from the same modules the React components import, and
 * inlined verbatim into the download.
 *
 * `rolldown` is Vite 8's own bundler, so this costs no new dependency. The child build gets no
 * plugins, which is also what keeps it from recursing back into this one.
 */
function situationRuntimePlugin(): Plugin {
  const ID = 'virtual:situation-runtime'
  const RESOLVED = '\0' + ID
  const entry = fileURLToPath(new URL('./src/export/situationRuntime.ts', import.meta.url))

  return {
    name: 'pokercraft:situation-runtime',
    resolveId(id: string) {
      return id === ID ? RESOLVED : null
    },
    async load(id: string) {
      if (id !== RESOLVED) return null

      const bundle = await rolldown({ input: entry, logLevel: 'warn' })
      const { output } = await bundle.generate({
        format: 'iife',
        name: 'PokercraftSituation',
        minify: true,
      })
      await bundle.close()

      // Watched explicitly: the virtual module has no import edge to the real file, so
      // without this a dev-server edit to the runtime would not invalidate this bundle.
      this.addWatchFile(entry)
      return `export default ${JSON.stringify(output[0].code)}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), situationRuntimePlugin()],
  define: {
    __GIT_HASH__: JSON.stringify(getGitHash()),
    __GIT_TIMESTAMP__: getGitTimestamp(),
  },
  // Base URL for custom domain (pokercraft.mcdic.net)
  // Use '/' for custom domains, '/<repo-name>/' for github.io URLs
  base: '/',
  build: {
    // Output directory
    outDir: 'dist',
    // Enable source maps for debugging
    sourcemap: true,
  },
  test: {
    // The app is browser-only, and i18next's language detector reads localStorage
    // and navigator at import time, so tests need a DOM by default.
    environment: 'jsdom',
    // Initializes i18next once, so components calling useTranslation() have it.
    setupFiles: ['./src/test/setup.ts'],
  },
  // WASM support will be added here when we integrate the Rust WASM module
})
