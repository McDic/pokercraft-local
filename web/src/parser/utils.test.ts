import { describe, it, expect } from 'vitest'
import {
  CurrencyRateConverter,
  convertMoneyToFloat,
  takeAllMoney,
  takeFirstInt,
  parseDatetime,
  detectCurrency,
} from './utils'
import { Currency } from '../types'

describe('CurrencyRateConverter', () => {
  it('should convert USD to USD with rate 1.0', () => {
    const converter = new CurrencyRateConverter()
    expect(converter.convert(Currency.USD, 100)).toBe(100)
  })

  it('should convert CNY to USD with default rate', () => {
    const converter = new CurrencyRateConverter()
    // Default CNY rate is 7.25
    expect(converter.convert(Currency.CNY, 725)).toBeCloseTo(100, 2)
  })

  it('should allow custom rates', () => {
    const converter = new CurrencyRateConverter({ [Currency.CNY]: 8.0 })
    expect(converter.convert(Currency.CNY, 800)).toBe(100)
  })
})

describe('detectCurrency', () => {
  it('should detect USD', () => {
    expect(detectCurrency('$')).toBe(Currency.USD)
  })

  it('should detect CNY', () => {
    expect(detectCurrency('¥')).toBe(Currency.CNY)
  })

  it('should detect KRW', () => {
    expect(detectCurrency('₩')).toBe(Currency.KRW)
  })

  it('should return null for unknown symbols', () => {
    expect(detectCurrency('€')).toBeNull()
    expect(detectCurrency('£')).toBeNull()
  })
})

describe('convertMoneyToFloat', () => {
  const converter = new CurrencyRateConverter()

  it('should parse simple USD amount', () => {
    expect(convertMoneyToFloat('$100', converter)).toBe(100)
  })

  it('should parse USD with decimals', () => {
    expect(convertMoneyToFloat('$100.50', converter)).toBe(100.5)
  })

  it('should parse USD with commas', () => {
    expect(convertMoneyToFloat('$1,000', converter)).toBe(1000)
    expect(convertMoneyToFloat('$1,234,567', converter)).toBe(1234567)
  })

  it('should convert CNY to USD', () => {
    // Default CNY rate is 7.25
    expect(convertMoneyToFloat('¥725', converter)).toBeCloseTo(100, 2)
  })

  it('should throw for invalid format', () => {
    expect(() => convertMoneyToFloat('100', converter)).toThrow()
    expect(() => convertMoneyToFloat('USD 100', converter)).toThrow()
  })
})

describe('takeAllMoney', () => {
  const converter = new CurrencyRateConverter()

  it('should extract all money values', () => {
    const values = [...takeAllMoney('Buy-in: $10 + $1', converter)]
    expect(values).toEqual([10, 1])
  })

  it('should handle multiple currencies', () => {
    const values = [...takeAllMoney('$100 and ¥725', converter)]
    expect(values).toHaveLength(2)
    expect(values[0]).toBe(100)
    expect(values[1]).toBeCloseTo(100, 2) // ¥725 / 7.25 = 100
  })

  it('should return empty for no money values', () => {
    const values = [...takeAllMoney('No money here', converter)]
    expect(values).toHaveLength(0)
  })
})

describe('takeFirstInt', () => {
  it('should extract first integer', () => {
    expect(takeFirstInt('100 Players')).toBe(100)
    expect(takeFirstInt('1st place')).toBe(1)
    expect(takeFirstInt('Level 16')).toBe(16)
  })

  it('should throw for no integers', () => {
    expect(() => takeFirstInt('No numbers')).toThrow()
  })
})

describe('parseDatetime', () => {
  it('should parse date and time strings', () => {
    const dt = parseDatetime('2025/08/01', '12:30:45')

    expect(dt.getFullYear()).toBe(2025)
    expect(dt.getMonth()).toBe(7) // August (0-indexed)
    expect(dt.getDate()).toBe(1)
    expect(dt.getHours()).toBe(12)
    expect(dt.getMinutes()).toBe(30)
    expect(dt.getSeconds()).toBe(45)
  })
})
