import { describe, it, expect, vi } from 'vitest'
import { resolveDefaultExport } from './cjsInterop'

describe('resolveDefaultExport', () => {
  function Comp() {}

  it('returns a plain function/class unchanged (vite 7 / correct interop)', () => {
    expect(resolveDefaultExport(Comp)).toBe(Comp)
  })

  it('unwraps a single { default } wrapper', () => {
    expect(resolveDefaultExport({ __esModule: true, default: Comp })).toBe(Comp)
  })

  it('unwraps the vite-8 __toESM(mod, 1) double-wrap shape', () => {
    // esbuild with isNodeMode=1 yields a namespace whose .default is the entire
    // CJS module object { __esModule: true, default: Component }.
    const moduleExports = { __esModule: true, default: Comp }
    const esbuildNamespace = { __esModule: true, default: moduleExports }
    expect(resolveDefaultExport(esbuildNamespace)).toBe(Comp)
  })

  it('stops at the first function and does not over-unwrap', () => {
    // A function that happens to carry a .default must be returned as-is.
    const fn = Object.assign(function () {}, { default: 'should-not-be-returned' })
    expect(resolveDefaultExport(fn)).toBe(fn)
  })

  it('logs an actionable error and returns the value when no component is found', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const notAComponent = { __esModule: true, nope: true }
    expect(resolveDefaultExport(notAComponent)).toBe(notAComponent)
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})
