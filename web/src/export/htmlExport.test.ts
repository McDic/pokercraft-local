import { describe, it, expect } from 'vitest'
import { generateExportHTML, type ExportChart, type ExportSection } from './htmlExport'
import { identityT } from '../test/i18n'

function chart(overrides: Partial<ExportChart> = {}): ExportChart {
  return {
    name: 'chart.historical.name',
    traces: [{ type: 'scatter', x: [1], y: [2] }],
    layout: { title: { text: 'chart.historical.title' } },
    ...overrides,
  }
}

function section(overrides: Partial<ExportSection> = {}): ExportSection {
  return {
    titleKey: 'export.section.tournament',
    prefix: 'tournament',
    charts: [chart()],
    ...overrides,
  }
}

describe('generateExportHTML', () => {
  it('renders the chrome through the translator and stamps the language', () => {
    const html = generateExportHTML([section()], identityT, 'ko')

    expect(html).toContain('<html lang="ko">')
    expect(html).toContain('<title>export.title</title>')
    expect(html).toContain('export.section.tournament')
    // The chart's name is emitted as its heading (it used to be dropped entirely).
    expect(html).toContain('<h3 class="chart-title">chart.historical.name</h3>')
  })

  it('names the section it was actually given', () => {
    // The old signature took (tournamentCharts, handHistoryCharts), so a third tab's
    // charts could only be smuggled in as one of those two — and were then labelled with
    // that tab's heading and filename. Right charts, wrong name.
    const html = generateExportHTML(
      [section({ titleKey: 'export.section.situation', prefix: 'situation' })],
      identityT,
      'en'
    )

    expect(html).toContain('export.section.situation')
    expect(html).not.toContain('export.section.handHistory')
    expect(html).toContain('id="situation-0"')
  })

  it('omits a section with no charts', () => {
    const html = generateExportHTML(
      [section(), section({ titleKey: 'export.section.handHistory', prefix: 'hand', charts: [] })],
      identityT,
      'en'
    )

    expect(html).toContain('export.section.tournament')
    expect(html).not.toContain('export.section.handHistory')
  })

  it('carries the caption into the export, wrapped in prose the browser can reflow', () => {
    // The caption is how the reader is told that zero means folding and that rows are not
    // comparable down the chart. An exported figure that has lost it is the one that gets
    // misread, so it travels with the chart rather than living in the app.
    const html = generateExportHTML(
      [section({ charts: [chart({ caption: ['Zero is folding.', 'Chip EV, not $EV.'] })] })],
      identityT,
      'en'
    )

    expect(html).toContain('<p class="chart-caption">Zero is folding.</p>')
    expect(html).toContain('<p class="chart-caption">Chip EV, not $EV.</p>')
  })

  // Tournament names are copied verbatim out of the uploaded summary file, and land
  // in trace names and customdata. `JSON.stringify` escapes neither `<` nor `/`, so
  // without an explicit escape a name containing `</script>` closes the export's
  // inline script early and the downloaded file renders with no charts at all.
  it('cannot be broken out of by a tournament name containing </script>', () => {
    const hostile = '</script><img src=x onerror=alert(1)>'
    const html = generateExportHTML(
      [
        section({
          charts: [
            chart({ traces: [{ type: 'scatter', name: hostile } as ExportChart['traces'][number]] }),
          ],
        }),
      ],
      identityT,
      'en'
    )

    // The literal tag must not survive anywhere in the document.
    expect(html).not.toContain('</script><img')
    expect(html).not.toContain('<img src=x')
    // Exactly the two script elements we author (the Plotly CDN tag and the plot
    // calls) — a break-out would create a third closing tag.
    expect(html.match(/<\/script>/g) ?? []).toHaveLength(2)
    // The name still round-trips as data, just escaped.
    expect(html).toContain('\\u003c/script>')
  })

  it('escapes a hostile name in the chart heading too', () => {
    const html = generateExportHTML(
      [section({ charts: [chart({ name: '<img src=x onerror=alert(1)>' })] })],
      identityT,
      'en'
    )
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x')
  })

  it('escapes a hostile caption', () => {
    const html = generateExportHTML(
      [section({ charts: [chart({ caption: ['<img src=x onerror=alert(1)>'] })] })],
      identityT,
      'en'
    )
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x')
  })
})
