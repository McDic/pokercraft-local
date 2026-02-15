/**
 * Parser utility functions
 */

import { Currency, DEFAULT_USD_RATES } from '../types'

// Regex patterns (ported from Python constants.py)
export const ANY_INT = /\d+/
export const ANY_MONEY = /[\$¥฿₫₱₩]\d(\d|(,\d))*(\.\d+)?/g

/**
 * Currency rate converter
 */
export class CurrencyRateConverter {
  private usdRates: Map<Currency, number>

  constructor(rates?: Partial<Record<Currency, number>>) {
    this.usdRates = new Map()
    for (const [currency, rate] of Object.entries(DEFAULT_USD_RATES)) {
      this.usdRates.set(currency as Currency, rate)
    }
    if (rates) {
      for (const [currency, rate] of Object.entries(rates)) {
        this.usdRates.set(currency as Currency, rate)
      }
    }
  }

  convert(currency: Currency, amount: number): number {
    const rate = this.usdRates.get(currency) ?? 1.0
    return amount / rate
  }
}

/**
 * Detect currency from a symbol character
 */
export function detectCurrency(symbol: string): Currency | null {
  for (const currency of Object.values(Currency)) {
    if (currency === symbol) {
      return currency
    }
  }
  return null
}

/**
 * Convert money string to USD float
 * Example: "$100.50" -> 100.50, "¥725" -> 100.0 (if rate is 7.25)
 */
export function convertMoneyToFloat(
  s: string,
  rateConverter: CurrencyRateConverter,
  supposedCurrency?: Currency
): number {
  s = s.trim()
  if (!ANY_MONEY.test(s)) {
    // Reset lastIndex since we're using global flag
    ANY_MONEY.lastIndex = 0
    throw new Error(`Failed to parse "${s}" as money`)
  }
  ANY_MONEY.lastIndex = 0

  const symbol = s[0]
  const currency = detectCurrency(symbol)

  if (!currency) {
    throw new Error(`Unknown currency symbol: ${symbol}`)
  }

  if (supposedCurrency && currency !== supposedCurrency) {
    throw new Error(
      `Expected currency ${supposedCurrency} but got ${currency}`
    )
  }

  const numStr = s.slice(1).replace(/,/g, '')
  const amount = parseFloat(numStr)

  return rateConverter.convert(currency, amount)
}

/**
 * Extract all money values from a string
 */
export function* takeAllMoney(
  s: string,
  rateConverter: CurrencyRateConverter,
  supposedCurrency?: Currency
): Generator<number> {
  const regex = new RegExp(ANY_MONEY.source, 'g')
  let match
  while ((match = regex.exec(s)) !== null) {
    yield convertMoneyToFloat(match[0], rateConverter, supposedCurrency)
  }
}

/**
 * Extract first integer from string
 */
export function takeFirstInt(s: string): number {
  const match = s.match(ANY_INT)
  if (!match) {
    throw new Error(`Failed to find integer in "${s}"`)
  }
  return parseInt(match[0], 10)
}

/**
 * Parse datetime string in format "YYYY/MM/DD HH:MM:SS"
 */
export function parseDatetime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('/').map(Number)
  const [hour, minute, second] = timeStr.split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute, second)
}
