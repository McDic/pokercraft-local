/**
 * Async utilities for UI responsiveness
 */

/**
 * Yield to browser for UI updates.
 * Uses double requestAnimationFrame + setTimeout to ensure
 * React state updates are flushed and rendered before continuing.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0)
      })
    })
  })
}
