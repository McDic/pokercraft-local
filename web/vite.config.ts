import { defineConfig } from 'vite'
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
    __GIT_HASH__: JSON.stringify(getGitHash()),
  },
  // Base URL for GitHub Pages deployment
  // Change this to match your repo name: /<repo-name>/
  base: '/pokercraft-local/',
  build: {
    // Output directory
    outDir: 'dist',
    // Enable source maps for debugging
    sourcemap: true,
  },
  // WASM support will be added here when we integrate the Rust WASM module
})
