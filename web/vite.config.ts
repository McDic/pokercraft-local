// From 'vitest/config', not 'vite': the plain defineConfig does not accept `test`.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
