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
 * The child build gets no plugins, which is what keeps it from recursing back into this one.
 *
 * `rolldown` is the bundler Vite 8 already uses, but it is declared in package.json all the
 * same, and pinned. Importing it because npm happens to hoist it out of Vite's tree is a
 * dependency either way — just an undeclared one, which pnpm's nested layout would not
 * provide, and which `vite: "^8.0.16"` could swap across a breaking major without a word in
 * this repo. The failure would land on `vite.config.ts` itself, so nothing would build,
 * including the Pages deploy.
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
      // *Every* module the runtime pulls in, not just the entry — the aggregation itself lives
      // in the nine files behind it. Vite has no import edge from the virtual module to any of
      // them, so without this, editing `situationLedger.ts` on the dev server hot-reloads the
      // app while this bundle stays as it was: an export taken from that session would ship a
      // stale copy of the aggregation, and be *silently* out of step with the app it came from.
      // That is the exact drift this whole design exists to make impossible, reintroduced in
      // the one environment anybody iterates in.
      const watched = await bundle.watchFiles
      await bundle.close()
      for (const file of watched) this.addWatchFile(file)

      const code = output[0].code

      // The child build inherits none of the parent's config, so two things that work fine in
      // the app would break only in the download, and only at runtime. `import.meta` in a
      // classic inline <script> is a SyntaxError that kills the entire exported page; a
      // `__GIT_HASH__` left undefined (the parent's `define` is not applied here) is a
      // ReferenceError. Neither fails the build, so the build is made to fail here.
      for (const forbidden of ['import.meta', '__GIT_']) {
        if (code.includes(forbidden)) {
          throw new Error(
            `situationRuntime bundle contains ${forbidden}, which only breaks inside the ` +
              `exported HTML. Keep the runtime's imports free of Vite-specific globals.`
          )
        }
      }

      return `export default ${JSON.stringify(code)}`
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
