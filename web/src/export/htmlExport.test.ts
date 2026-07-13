import { describe, it, expect } from 'vitest'
import { generateExportHTML, type ExportChart, type ExportSection } from './htmlExport'
import type { SituationExport } from './situationPayload'
import { DEFAULT_FILTERS } from '../visualization/handHistory/situationFilters'
import { DEFAULT_SCOPE } from '../visualization/handHistory/handClassProfit'
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

  it('keeps two non-empty sections apart', () => {
    // The old positional signature made an id collision structurally impossible; a list of
    // sections makes the prefix a caller's promise. If two sections ever shared one, both
    // would render into `#hand-0` and Plotly would draw the second over the first — one
    // section silently showing the other's chart. This pins that they stay distinct.
    const html = generateExportHTML(
      [
        section(),
        section({ titleKey: 'export.section.handHistory', prefix: 'hand' }),
      ],
      identityT,
      'en'
    )

    expect(html).toContain('export.section.tournament')
    expect(html).toContain('export.section.handHistory')
    expect(html).toContain('id="tournament-0"')
    expect(html).toContain('id="hand-0"')
    // Both sections must actually be drawn, not just headed.
    expect(html.match(/Plotly\.newPlot\(/g) ?? []).toHaveLength(2)
  })

  it('does not let the light-theme patch overwrite an axis the chart styled itself', () => {
    // The situation ledger draws its zero line dark and heavy because zero *is* the chart.
    // These are defaults for the export's white background, not overrides — a figure that
    // set a colour on purpose keeps it.
    const html = generateExportHTML(
      [
        section({
          charts: [
            chart({
              layout: { xaxis: { zerolinecolor: '#898781', zerolinewidth: 2 } },
            }),
          ],
        }),
      ],
      identityT,
      'en'
    )

    expect(html).toContain('#898781')
    expect(html).not.toContain('"zerolinecolor":"#bbb"')
    // The colours the chart did *not* set still get their light-background default.
    expect(html).toContain('"gridcolor":"#ddd"')
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

  describe('a live situation section', () => {
    // This section is not a picture: it inlines a bundled runtime and a payload of decisions,
    // and its dropdowns keep working after download. That makes it the one part of the export
    // that ships *executable code plus user-derived data* in the same document, so it gets the
    // scrutiny the static path already has.

    function live(overrides: Partial<SituationExport> = {}): ExportSection {
      return {
        titleKey: 'export.section.situation',
        prefix: 'situation',
        charts: [],
        situation: {
          rows: [[2, 2, 0, 2, 2, 2.5, 30, 6, 1.25, 'Ah', 'Kd']],
          filters: DEFAULT_FILTERS,
          scope: DEFAULT_SCOPE,
          strings: { 'chart.situation.empty': 'nothing here' },
          droppedHands: 0,
          ...overrides,
        },
      }
    }

    it('inlines the runtime and mounts it over the payload', () => {
      const html = generateExportHTML([live()], identityT, 'en')

      expect(html).toContain('<div id="situation-app"></div>')
      expect(html).toContain('PokercraftSituation.mount(')
      // The bundle really is in there, not just the call that needs it.
      expect(html).toContain('var PokercraftSituation')
      // A live section draws itself; a static `Plotly.newPlot` would be a second, stale copy.
      expect(html).not.toContain('Plotly.newPlot(')
    })

    it('leaves the runtime out of an export that has no use for it', () => {
      // It is ~13KB of dead weight in a tournament export, which has no filters to drive.
      const html = generateExportHTML([section()], identityT, 'en')

      expect(html).not.toContain('PokercraftSituation')
    })

    it('still draws the static sections beside it', () => {
      const html = generateExportHTML(
        [section(), live()],
        identityT,
        'en'
      )

      expect(html).toContain('Plotly.newPlot(')
      expect(html).toContain('PokercraftSituation.mount(')
      expect(html).toContain('id="tournament-0"')
      expect(html).toContain('<div id="situation-app"></div>')
    })

    it('cannot be broken out of by a hostile card string in the payload', () => {
      // Hole cards are parsed out of an uploaded hand-history file, so they are user input
      // that lands inside an inline <script>. `JSON.stringify` escapes neither `<` nor `/`.
      const html = generateExportHTML(
        [live({ rows: [[2, 2, 0, 2, 2, null, 30, 6, 1, '</script><img src=x onerror=alert(1)>', 'Kd']] })],
        identityT,
        'en'
      )

      expect(html).not.toContain('</script><img')
      expect(html).not.toContain('<img src=x')
      expect(html).toContain('\\u003c/script>')
    })

    it('cannot be broken out of by a hostile translation string', () => {
      // The whole dictionary rides along in the payload, so it is inside the script element too.
      const html = generateExportHTML(
        [live({ strings: { 'chart.situation.empty': '</script><img src=x onerror=alert(1)>' } })],
        identityT,
        'en'
      )

      expect(html).not.toContain('<img src=x')
    })

    it('emits exactly the script elements it authors', () => {
      // Three: the Plotly CDN tag, the inlined runtime, and the bootstrap. A break-out — from
      // the payload *or* from a `</script` sequence inside the bundle itself — would make a
      // fourth closing tag, and orphan the rest of the page as text.
      const html = generateExportHTML([live()], identityT, 'en')

      expect(html.match(/<script/g) ?? []).toHaveLength(3)
      expect(html.match(/<\/script>/g) ?? []).toHaveLength(3)
    })
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
