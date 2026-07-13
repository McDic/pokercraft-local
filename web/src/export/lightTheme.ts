/**
 * The exported file paints its charts on white, and the app paints them on dark.
 *
 * Shared by the static export path and the interactive situation runtime, which draw into the
 * same white chart containers. Two copies would drift, and the drift would be invisible: a
 * chart that is subtly the wrong colour still looks like a chart.
 */

import type { Layout } from 'plotly.js-dist-min'

/**
 * Axis colours for a light background — as **defaults, not overrides**.
 *
 * The chart's own values win. A figure that deliberately styles an axis has a reason, and the
 * reason is usually meaning: the situation ledger draws its zero line heavy and dark because
 * zero *is* the chart ("right of the line, the decision beat folding"). Spreading these on top
 * would flatten it to a hairline no darker than a gridline — in the export only, where nobody
 * would notice.
 */
const AXIS_DEFAULTS = { gridcolor: '#ddd', zerolinecolor: '#bbb', linecolor: '#ccc' }

export function toLightLayout(layout: Partial<Layout>): Record<string, unknown> {
  const src = layout as Record<string, unknown>
  const patched: Record<string, unknown> = { ...src }

  for (const key of Object.keys(src)) {
    if (/^[xy]axis\d*$/.test(key) && typeof src[key] === 'object' && src[key] !== null) {
      patched[key] = { ...AXIS_DEFAULTS, ...(src[key] as object) }
    }
  }

  return {
    ...patched,
    autosize: true,
    paper_bgcolor: '#fff',
    plot_bgcolor: '#fff',
    font: { ...(src.font as object), color: '#333' },
  }
}
