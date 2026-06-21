/**
 * Interop-safe re-export of react-plotly.js's <Plot> component.
 *
 * react-plotly.js is a Babel-compiled CommonJS module whose `module.exports` is
 * `{ __esModule: true, default: PlotComponent }`. Under vite 8 the dep is
 * bundled via esbuild's Node interop (`__toESM(require_react_plotly(), 1)`),
 * which ignores `__esModule` and sets `.default` to the entire module object,
 * so `import Plot from 'react-plotly.js'` becomes
 * `{ __esModule: true, default: PlotComponent }` — an object. Rendering that
 * object throws React error #130 ("Element type is invalid … got: object") and
 * blanks the whole page in the production build. (Vite 7 / the dev server
 * resolved the default correctly, so it was production-only.)
 *
 * resolveDefaultExport unwraps to the real component and works under both
 * bundlers. See ./cjsInterop for the mechanism.
 */
import * as ReactPlotly from 'react-plotly.js'
import { resolveDefaultExport } from './cjsInterop'

type PlotType = typeof import('react-plotly.js').default

const Plot: PlotType = resolveDefaultExport<PlotType>(ReactPlotly)

export default Plot
