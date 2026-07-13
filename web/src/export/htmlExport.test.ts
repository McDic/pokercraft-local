import { describe, it, expect } from 'vitest'
import { generateExportHTML, type ExportChart } from './htmlExport'
import { identityT } from '../test/i18n'

function chart(overrides: Partial<ExportChart> = {}): ExportChart {
  return {
    name: 'chart.historical.name',
    traces: [{ type: 'scatter', x: [1], y: [2] }],
    layout: { title: { text: 'chart.historical.title' } },
    ...overrides,
  }
}

describe('generateExportHTML', () => {
  it('renders the chrome through the translator and stamps the language', () => {
    const html = generateExportHTML([chart()], [], identityT, 'ko')

    expect(html).toContain('<html lang="ko">')
    expect(html).toContain('<title>export.title</title>')
    expect(html).toContain('export.section.tournament')
    // The chart's name is emitted as its heading (it used to be dropped entirely).
    expect(html).toContain('<h3 class="chart-title">chart.historical.name</h3>')
  })

  // Tournament names are copied verbatim out of the uploaded summary file, and land
  // in trace names and customdata. `JSON.stringify` escapes neither `<` nor `/`, so
  // without an explicit escape a name containing `</script>` closes the export's
  // inline script early and the downloaded file renders with no charts at all.
  it('cannot be broken out of by a tournament name containing </script>', () => {
    const hostile = '</script><img src=x onerror=alert(1)>'
    const html = generateExportHTML(
      [chart({ traces: [{ type: 'scatter', name: hostile } as ExportChart['traces'][number]] })],
      [],
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
    const html = generateExportHTML([chart({ name: '<img src=x onerror=alert(1)>' })], [], identityT, 'en')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x')
  })
})
