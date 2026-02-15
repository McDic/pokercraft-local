/**
 * Analytics utilities for data transformations
 */

/**
 * Cumulative sum of an array
 */
export function cumsum(arr: number[]): number[] {
  const result: number[] = []
  let sum = 0
  for (const v of arr) {
    sum += v
    result.push(sum)
  }
  return result
}

/**
 * Cumulative maximum of an array
 */
export function cummax(arr: number[]): number[] {
  const result: number[] = []
  let max = -Infinity
  for (const v of arr) {
    max = Math.max(max, v)
    result.push(max)
  }
  return result
}

/**
 * Cumulative minimum of an array
 */
export function cummin(arr: number[]): number[] {
  const result: number[] = []
  let min = Infinity
  for (const v of arr) {
    min = Math.min(min, v)
    result.push(min)
  }
  return result
}

/**
 * Rolling sum with a given window size (O(n) sliding window)
 */
export function rollingSum(arr: number[], windowSize: number): (number | null)[] {
  const result: (number | null)[] = []
  let windowSum = 0

  for (let i = 0; i < arr.length; i++) {
    windowSum += arr[i]
    if (i >= windowSize) {
      windowSum -= arr[i - windowSize]
    }
    if (i < windowSize - 1) {
      result.push(null)
    } else {
      result.push(windowSum)
    }
  }
  return result
}

/**
 * Rolling mean with a given window size
 */
export function rollingMean(arr: number[], windowSize: number): (number | null)[] {
  const sums = rollingSum(arr, windowSize)
  return sums.map(s => (s !== null ? s / windowSize : null))
}

/**
 * Expanding sum (cumulative sum for each position)
 */
export function expandingSum(arr: number[]): number[] {
  return cumsum(arr)
}

/**
 * Expanding mean
 */
export function expandingMean(arr: number[]): number[] {
  const sums = cumsum(arr)
  return sums.map((s, i) => s / (i + 1))
}

/**
 * Log base 2, returns NaN for non-positive values
 */
export function log2OrNaN(x: number): number {
  if (x <= 0) return NaN
  return Math.log2(x)
}

/**
 * Log base 10, returns NaN for non-positive values
 */
export function log10OrNaN(x: number): number {
  if (x <= 0) return NaN
  return Math.log10(x)
}

/**
 * Simple linear regression (OLS)
 * Returns { slope, intercept, predict }
 */
export function linearRegression(
  x: number[],
  y: number[]
): { slope: number; intercept: number; predict: (x: number) => number } {
  // Filter out NaN values
  const validPairs: [number, number][] = []
  for (let i = 0; i < x.length; i++) {
    if (!isNaN(x[i]) && !isNaN(y[i])) {
      validPairs.push([x[i], y[i]])
    }
  }

  if (validPairs.length < 2) {
    return { slope: NaN, intercept: NaN, predict: () => NaN }
  }

  const n = validPairs.length
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0
  for (const [xi, yi] of validPairs) {
    sumX += xi
    sumY += yi
    sumXY += xi * yi
    sumX2 += xi * xi
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  return {
    slope,
    intercept,
    predict: (xVal: number) => slope * xVal + intercept,
  }
}
