import { describe, it, expect } from 'vitest'
import { PLOT_CONFIG } from './plotConfig'

// Every source file except tests, read as text: a chart that draws with its own inline config
// would bring Plotly 4's default-on "Upload to Cloud" button back, and nothing renders the
// modebar in a unit test to notice.
const sources = Object.entries(
  import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })
)

describe('PLOT_CONFIG', () => {
  it('keeps the upload-to-cloud button off', () => {
    expect(PLOT_CONFIG.showSendToCloud).toBe(false)
  })

  it('is the config every <Plot> in the app is drawn with', () => {
    const plots = sources.flatMap(([file, src]) =>
      [...src.matchAll(/<Plot\b[^>]*?\bconfig=\{([^}]*)\}/g)].map((m) => [file, m[1]])
    )
    expect(plots.length).toBeGreaterThan(0)
    for (const [file, config] of plots) expect(config, file).toBe('PLOT_CONFIG')
  })

  it('is the config every direct Plotly call is drawn with', () => {
    const calls = sources.flatMap(([file, src]) =>
      [...src.matchAll(/Plotly\.(?:newPlot|react)\(([^;]*?)\)[;.]/g)].map((m) => [file, m[1]])
    )
    expect(calls.length).toBeGreaterThan(0)
    for (const [file, args] of calls) expect(args, file).toMatch(/PLOT_CONFIG\W*$/)
  })
})
