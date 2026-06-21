/**
 * Helpers for resolving the default export of CommonJS dependencies.
 *
 * A bundler's CJS-to-ESM interop decides what `import X from 'cjs-pkg'` yields.
 * For a Babel-style CJS module whose `module.exports` is
 * `{ __esModule: true, default: Thing }`, different bundlers disagree:
 *
 *  - Vite 7 (Rollup `getDefaultExportFromCjs`) honors `__esModule` → `Thing`.
 *  - Vite 8 (esbuild Node interop, `__toESM(require(...), 1)`) ignores
 *    `__esModule` and makes `.default` the whole module object, so the default
 *    import becomes `{ __esModule: true, default: Thing }` — an extra wrapper.
 *
 * `resolveDefaultExport` peels off `.default` wrappers until it reaches a
 * function/class, which is correct under either bundler. It is deliberately
 * kept free of any heavyweight (browser-only) imports so it can be unit-tested
 * in a plain Node environment.
 */

/**
 * Resolve a (possibly multiply-wrapped) CommonJS default export to the
 * underlying function/class. Pass either the default import or the namespace
 * (`import * as ns`) — both are handled.
 *
 * If no function is found the input is returned unchanged and an actionable
 * error is logged, rather than thrown: callers render the result, so an
 * ErrorBoundary can still show a fallback instead of the whole module failing
 * to load. The log makes a future interop regression obvious (it would
 * otherwise surface as a cryptic React #130 "element type is invalid").
 */
export function resolveDefaultExport<T>(mod: unknown): T {
  let candidate: unknown = mod
  while (
    candidate != null &&
    typeof candidate !== 'function' &&
    (candidate as { default?: unknown }).default != null
  ) {
    candidate = (candidate as { default?: unknown }).default
  }
  if (typeof candidate !== 'function') {
    console.error(
      'resolveDefaultExport: expected a component/function but resolved to',
      candidate,
    )
  }
  return candidate as T
}
