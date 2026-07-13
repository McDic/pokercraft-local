/// <reference types="vite/client" />

declare const __GIT_HASH__: string
declare const __GIT_TIMESTAMP__: number

/**
 * `src/export/situationRuntime.ts`, bundled to a self-contained IIFE and handed over as
 * source text. See `situationRuntimePlugin` in vite.config.ts. Evaluating it defines
 * `PokercraftSituation.mount(root, payload)`.
 */
declare module 'virtual:situation-runtime' {
  const source: string
  export default source
}
