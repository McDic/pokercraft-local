/**
 * The situation charts, running inside the exported HTML file.
 *
 * This module is bundled on its own (see the `virtual:situation-runtime` plugin in
 * vite.config.ts) and inlined into the downloaded page as a plain `<script>`. It is the only
 * part of the app that ships as source rather than as a picture.
 *
 * ## It imports the real chart code, and that is the whole point
 *
 * The exported file has live dropdowns, so it has to re-aggregate — which means the
 * aggregation has to exist twice: once in the app, once in the download. The tempting version
 * is a second implementation, hand-written into a template string. It would work, and then it
 * would drift, and the drift would be *silent*: the ledger and the hand-class chart share a
 * significance rule (blue/red only when the 95% interval clears zero), an exclusions gate, and
 * a fold baseline. A downloaded chart that scored any of those differently would not look
 * broken. It would look like a chart, and it would be lying.
 *
 * So there is no second implementation. This calls `getSituationLedgerData` and
 * `getHandClassProfitData` — the same functions, from the same files, that the React
 * components call. The exported file and the app cannot disagree, because they are running the
 * same code.
 *
 * The imports below are all pure: every i18n and Plotly reference in that chain is an
 * `import type`, so the bundle is a few KB of arithmetic with no runtime dependencies. Keep it
 * that way — importing anything that reaches `src/i18n/index.ts` would pull i18next, its
 * language detector, and `localStorage` access into a static file.
 */

import type { Translate } from '../i18n'
import type { PreflopSituation } from '../analysis/preflopSituation'
import type { DeltaFigure } from '../visualization/handHistory/deltaFigure'
import { getSituationLedgerData } from '../visualization/handHistory/situationLedger'
import type { HandClassScope } from '../visualization/handHistory/handClassProfit'
import { getHandClassProfitData } from '../visualization/handHistory/handClassProfit'
import type { SituationFilters } from '../visualization/handHistory/situationFilters'
import type { Control } from '../visualization/handHistory/situationControls'
import {
  FILTER_CONTROLS,
  SCOPE_CONTROLS,
} from '../visualization/handHistory/situationControls'
import type { SituationExport } from './situationPayload'
import { unpackSituation } from './situationPayload'
import { toLightLayout } from './lightTheme'

/** Loaded from the CDN by the exported page, before this script runs. */
interface Plotly {
  react: (el: HTMLElement, data: unknown[], layout: unknown, config: unknown) => Promise<unknown>
  purge: (el: HTMLElement) => void
}
declare const window: { Plotly: Plotly } & Window

/**
 * i18next, minus i18next.
 *
 * The strings are already resolved for the export's language (with the English fallback
 * applied), so all that is left of `t` is `{{placeholder}}` substitution. This matches
 * i18next's behaviour under the app's config — `escapeValue: false`, and an unknown
 * placeholder is left standing rather than replaced with "undefined", which is the difference
 * between a visible bug and an invisible one.
 */
export function makeTranslator(strings: Record<string, string>): Translate {
  return ((key: string, values?: Record<string, unknown>) => {
    const template = Object.prototype.hasOwnProperty.call(strings, key) ? strings[key] : key
    if (!values) return template
    return template.replace(/\{\{(\w+)}}/g, (whole: string, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole
    )
  }) as unknown as Translate
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

/**
 * One control, as a labelled `<select>`.
 *
 * This is the whole of what the export does *not* share with the React filter bar: laying a
 * descriptor out as DOM instead of as JSX. What the control offers, and what choosing an
 * option means, comes from `situationControls.ts` — see the note there on why that half
 * cannot be allowed to exist twice.
 */
function renderControl<S>(
  control: Control<S>,
  state: () => S,
  t: Translate,
  onChange: (next: S) => void
): HTMLLabelElement {
  const label = el('label')
  label.append(t(control.labelKey))

  const box = el('select')
  for (const [value, text] of control.options(t)) {
    const option = el('option')
    option.value = value
    option.textContent = text
    box.append(option)
  }
  box.value = control.valueOf(state())
  box.addEventListener('change', () => onChange(control.apply(state(), box.value)))

  label.append(box)
  return label
}

function renderControls<S>(
  controls: Array<Control<S>>,
  state: () => S,
  t: Translate,
  onChange: (next: S) => void
): HTMLDivElement {
  const bar = el('div', 'situation-filters')
  bar.append(...controls.map(control => renderControl(control, state, t, onChange)))
  return bar
}

/** A figure and its caption. The caption is re-rendered too: its counts depend on the filters. */
class FigureBlock {
  readonly root = el('section')
  private readonly caption = el('div')
  private readonly container = el('div', 'chart-container')
  private readonly plot = el('div')
  private readonly empty = el('div', 'no-data')
  private readonly emptyMessage: () => string

  constructor(emptyMessage: () => string) {
    this.emptyMessage = emptyMessage
    this.plot.style.width = '100%'
    this.container.append(this.plot)
    this.root.append(this.caption, this.empty, this.container)
  }

  render(figure: DeltaFigure): void {
    this.caption.replaceChildren(
      ...figure.caption.map(line => {
        const p = el('p', 'chart-caption')
        p.textContent = line
        return p
      })
    )

    // An empty chart still gets its caption: that is where the counts live, and
    // "you have squeezed from UTG six times, all below the threshold" is exactly what an
    // empty chart needs to say and cannot say from an empty state alone.
    const hasRows = figure.traces.length > 0
    this.empty.textContent = hasRows ? '' : this.emptyMessage()
    this.empty.style.display = hasRows ? 'none' : ''
    this.container.style.display = hasRows ? '' : 'none'

    if (!hasRows) {
      window.Plotly.purge(this.plot)
      return
    }
    void window.Plotly.react(this.plot, figure.traces, toLightLayout(figure.layout), {
      responsive: true,
    })
  }
}

export function mount(root: HTMLElement, payload: SituationExport): void {
  const t = makeTranslator(payload.strings)
  const situations: PreflopSituation[] = payload.rows.map(unpackSituation)

  let filters: SituationFilters = payload.filters
  let scope: HandClassScope = payload.scope

  const ledger = new FigureBlock(() => t('chart.situation.empty'))
  const handClass = new FigureBlock(() => t('chart.handClass.empty'))

  function redraw(): void {
    ledger.render(getSituationLedgerData(situations, filters, t, payload.droppedHands))
    handClass.render(getHandClassProfitData(situations, filters, scope, t))
  }

  /** Only the class chart depends on the scope, so the ledger is left alone. */
  function redrawHandClass(): void {
    handClass.render(getHandClassProfitData(situations, filters, scope, t))
  }

  const filterBar = renderControls(
    FILTER_CONTROLS,
    () => filters,
    t,
    next => {
      filters = next
      redraw()
    }
  )

  const scopeBar = renderControls(
    SCOPE_CONTROLS,
    () => scope,
    t,
    next => {
      scope = next
      // Only the class chart depends on the scope, so the ledger is left standing.
      redrawHandClass()
    }
  )

  root.append(filterBar, ledger.root, scopeBar, handClass.root)
  redraw()
}
