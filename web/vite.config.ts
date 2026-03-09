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

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim()
  if (!trimmed || trimmed === '/') {
    return '/'
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

function getRepositoryInfo(): { owner: string; repo: string } | null {
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) {
    return null
  }

  const [owner, repo] = repository.split('/')
  if (!owner || !repo) {
    return null
  }

  return { owner, repo }
}

function getBasePath(): string {
  if (process.env.BASE_PATH) {
    return normalizeBasePath(process.env.BASE_PATH)
  }

  const repositoryInfo = getRepositoryInfo()
  if (!repositoryInfo) {
    return '/'
  }

  const rootPagesRepo = `${repositoryInfo.owner.toLowerCase()}.github.io`
  return repositoryInfo.repo.toLowerCase() === rootPagesRepo
    ? '/'
    : `/${repositoryInfo.repo}/`
}

function getSiteUrl(): string {
  const configuredSiteUrl = process.env.SITE_URL?.trim()
  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/+$/, '')
  }

  const repositoryInfo = getRepositoryInfo()
  if (!repositoryInfo) {
    return 'http://localhost:5173'
  }

  const rootPagesRepo = `${repositoryInfo.owner.toLowerCase()}.github.io`
  return repositoryInfo.repo.toLowerCase() === rootPagesRepo
    ? `https://${repositoryInfo.owner}.github.io`
    : `https://${repositoryInfo.owner}.github.io/${repositoryInfo.repo}`
}

function getAssetUrl(siteUrl: string, basePath: string, assetName: string): string {
  const assetPath = `${basePath.replace(/^\//, '')}${assetName}`
  const siteOrigin = new URL(siteUrl).origin
  return new URL(assetPath, `${siteOrigin}/`).toString()
}

const basePath = getBasePath()
const siteUrl = getSiteUrl()
const socialImageUrl = getAssetUrl(
  siteUrl,
  basePath,
  'pokercraft_local_full_banner.png',
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-pages-metadata',
      transformIndexHtml(html) {
        return html
          .replace(/%PUBLIC_BASE_PATH%/g, basePath)
          .replace(/%PUBLIC_SITE_URL%/g, siteUrl)
          .replace(/%PUBLIC_SOCIAL_IMAGE_URL%/g, socialImageUrl)
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
    __GIT_HASH__: JSON.stringify(getGitHash()),
  },
  // Default to local root, but use the repo path automatically on GitHub Pages forks.
  base: basePath,
  build: {
    // Output directory
    outDir: 'dist',
    // Enable source maps for debugging
    sourcemap: true,
  },
  // WASM support will be added here when we integrate the Rust WASM module
})
