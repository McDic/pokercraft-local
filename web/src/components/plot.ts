/**
 * Interop-safe re-export of react-plotly.js's <Plot> component.
 *
 * react-plotly.js is a Babel-compiled CommonJS module whose `module.exports` is
 * `{ __esModule: true, default: PlotComponent }`. How a bundler resolves
 * `import Plot from 'react-plotly.js'` depends on its CJS interop:
 *
 *  - Vite 7 (Rollup `getDefaultExportFromCjs`) honored `__esModule` and gave
 *    back `PlotComponent` directly. Works.
 *  - Vite 8 bundles this dep through esbuild's Node interop, emitting
 *    `__toESM(require_react_plotly(), 1)`. With `isNodeMode === 1`, `__toESM`
 *    ignores `__esModule` and sets `.default` to the *entire* module object, so
 *    `Plot` becomes `{ __esModule: true, default: PlotComponent }` — an object.
 *    Rendering that object throws React error #130 ("Element type is invalid …
 *    got: object") and blanks the whole page in the production build.
 *
 * To be correct under either bundler, resolve the import and peel off any
 * `.default` wrappers until we reach the component itself (a function/class).
 * The loop stops as soon as it hits a function, so it can never over-unwrap
 * past the real component.
 */
import * as ReactPlotly from 'react-plotly.js'

type PlotType = typeof import('react-plotly.js').default

function resolvePlot(): PlotType {
  let candidate: unknown = (ReactPlotly as { default?: unknown }).default ?? ReactPlotly
  while (
    candidate != null &&
    typeof candidate !== 'function' &&
    (candidate as { default?: unknown }).default != null
  ) {
    candidate = (candidate as { default?: unknown }).default
  }
  return candidate as PlotType
}

const Plot: PlotType = resolvePlot()

export default Plot
