import type { Translate } from '../i18n'

const REPO_URL = 'https://github.com/McDic/pokercraft-local'

export interface VersionInfo {
  text: string
  url: string | null
}

export function getVersionInfo(t: Translate): VersionInfo {
  const hash = __GIT_HASH__
  const ts = __GIT_TIMESTAMP__
  if (!hash || hash === 'unknown' || !ts) {
    return { text: t('header.devBuild'), url: null }
  }
  const d = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const dt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return {
    text: `${hash} (${dt})`,
    url: `${REPO_URL}/commit/${hash}`,
  }
}
