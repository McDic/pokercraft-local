import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
