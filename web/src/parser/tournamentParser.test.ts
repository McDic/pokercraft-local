import { describe, it, expect } from 'vitest'
import { parseTournamentSummary, isTournamentSummaryFile } from './tournamentParser'
import { CurrencyRateConverter } from './utils'

describe('isTournamentSummaryFile', () => {
  it('should match valid tournament summary filenames', () => {
    expect(isTournamentSummaryFile('GG20250801 - Tournament #123456 - Summary.txt')).toBe(true)
    expect(isTournamentSummaryFile('GG20231225 - Tournament #999999 - My Tournament.txt')).toBe(true)
  })

  it('should not match hand history files', () => {
    expect(isTournamentSummaryFile('GG20250801-0012 - Hold\'em.txt')).toBe(false)
  })

  it('should not match non-txt files', () => {
    expect(isTournamentSummaryFile('GG20250801 - Tournament #123456 - Summary.csv')).toBe(false)
  })
})

describe('parseTournamentSummary', () => {
  const rateConverter = new CurrencyRateConverter()

  const sampleTournamentSummary = `
Tournament #123456789, $10 + $1 Buy-in, Hold'em No Limit
Buy-in: $10 + $1
100 Players
Total Prize Pool: $1,000
Tournament started 2025/08/01 12:00:00
1st : Hero, $300

You received a total of $300
`.trim()

  it('should parse tournament summary correctly', () => {
    const result = parseTournamentSummary(sampleTournamentSummary, rateConverter)

    expect(result).not.toBeNull()
    if (!result) return

    expect(result.id).toBe(123456789)
    expect(result.name).toBe("$10 + $1 Buy-in")
    expect(result.buyInPure).toBe(10)
    expect(result.rake).toBe(1)
    expect(result.totalPrizePool).toBe(1000)
    expect(result.totalPlayers).toBe(100)
    expect(result.myRank).toBe(1)
    expect(result.myPrize).toBe(300)
    expect(result.myEntries).toBe(1)
  })

  it('should parse datetime correctly', () => {
    const result = parseTournamentSummary(sampleTournamentSummary, rateConverter)

    expect(result).not.toBeNull()
    if (!result) return

    expect(result.startTime.getFullYear()).toBe(2025)
    expect(result.startTime.getMonth()).toBe(7) // August (0-indexed)
    expect(result.startTime.getDate()).toBe(1)
    expect(result.startTime.getHours()).toBe(12)
    expect(result.startTime.getMinutes()).toBe(0)
    expect(result.startTime.getSeconds()).toBe(0)
  })

  it('should handle re-entries', () => {
    const summaryWithReentries = `
Tournament #123456789, $10 + $1 Buy-in, Hold'em No Limit
Buy-in: $10 + $1
100 Players
Total Prize Pool: $1,000
Tournament started 2025/08/01 12:00:00
5th : Hero, $50

You made 2 re-entries and received a total of $50
`.trim()

    const result = parseTournamentSummary(summaryWithReentries, rateConverter)

    expect(result).not.toBeNull()
    if (!result) return

    expect(result.myEntries).toBe(3) // 1 initial + 2 re-entries
    expect(result.myRank).toBe(5)
    expect(result.myPrize).toBe(50)
  })

  it('should skip freerolls when allowFreerolls is false', () => {
    const freerollSummary = `
Tournament #123456789, Freeroll, Hold'em No Limit
Buy-in: Free
100 Players
Total Prize Pool: $100
Tournament started 2025/08/01 12:00:00
10th : Hero, $5

You received a total of $5
`.trim()

    const result = parseTournamentSummary(freerollSummary, rateConverter, false)
    expect(result).toBeNull()
  })

  it('should include freerolls when allowFreerolls is true', () => {
    const freerollSummary = `
Tournament #123456789, Freeroll, Hold'em No Limit
Buy-in: Free
100 Players
Total Prize Pool: $100
Tournament started 2025/08/01 12:00:00
10th : Hero, $5

You received a total of $5
`.trim()

    const result = parseTournamentSummary(freerollSummary, rateConverter, true)
    expect(result).not.toBeNull()
    if (!result) return

    expect(result.buyInPure).toBe(0)
    expect(result.rake).toBe(0)
  })

  it('should return null for incomplete data', () => {
    const incompleteSummary = `
Tournament #123456789, Some Tournament
Buy-in: $10 + $1
`.trim()

    const result = parseTournamentSummary(incompleteSummary, rateConverter)
    expect(result).toBeNull()
  })

  it('should handle CNY currency', () => {
    const cnySummary = `
Tournament #123456789, ¥110 Buy-in, Hold'em No Limit
Buy-in: ¥100 + ¥10
100 Players
Total Prize Pool: ¥10,000
Tournament started 2025/08/01 12:00:00
1st : Hero, ¥3,000

You received a total of ¥3,000
`.trim()

    // Default CNY rate is 7.25
    const result = parseTournamentSummary(cnySummary, rateConverter)

    expect(result).not.toBeNull()
    if (!result) return

    // All amounts should be converted to USD
    expect(result.buyInPure).toBeCloseTo(100 / 7.25, 2)
    expect(result.rake).toBeCloseTo(10 / 7.25, 2)
    expect(result.totalPrizePool).toBeCloseTo(10000 / 7.25, 2)
    expect(result.myPrize).toBeCloseTo(3000 / 7.25, 2)
  })
})
