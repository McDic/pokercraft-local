import { describe, it, expect } from 'vitest'
import { parseHandHistory, isHandHistoryFile } from './handHistoryParser'

describe('isHandHistoryFile', () => {
  it('should match valid hand history filenames', () => {
    expect(isHandHistoryFile('GG20250801-0012 - Some Tournament.txt')).toBe(true)
    expect(isHandHistoryFile('GG20250801-1234 - Hold\'em.txt')).toBe(true)
  })

  it('should not match Short Deck files', () => {
    expect(isHandHistoryFile('GG20250801-0012 - Short Deck Tournament.txt')).toBe(false)
  })

  it('should not match Omaha files', () => {
    expect(isHandHistoryFile('GG20250801-0012 - Omaha Tournament.txt')).toBe(false)
  })

  it('should not match tournament summary files', () => {
    expect(isHandHistoryFile('GG20250801 - Tournament #12345 - Summary.txt')).toBe(false)
  })
})

describe('parseHandHistory', () => {
  const sampleHandHistory = `
Poker Hand #TM4832872904: Tournament #220597937, Zodiac Dog Ultra Deepstack 7-Max ¥110 [Turbo] Hold'em No Limit - Level16(600/1,200) - 2025/08/01 00:53:29
Table '25' 7-max Seat #7 is the button
Seat 1: f123395 (43,493 in chips)
Seat 2: 392ff24f (17,160 in chips)
Seat 3: 84466c0e (59,654 in chips)
Seat 4: afc7064f (36,309 in chips)
Seat 5: de10679c (20,504 in chips)
Seat 6: 471910c (31,717 in chips)
Seat 7: Hero (22,175 in chips)
392ff24f: posts the ante 150
84466c0e: posts the ante 150
afc7064f: posts the ante 150
471910c: posts the ante 150
de10679c: posts the ante 150
Hero: posts the ante 150
f123395: posts the ante 150
f123395: posts small blind 600
392ff24f: posts big blind 1,200
*** HOLE CARDS ***
Dealt to f123395
Dealt to 392ff24f
Dealt to 84466c0e
Dealt to afc7064f
Dealt to de10679c
Dealt to 471910c
Dealt to Hero [Jh 8c]
84466c0e: folds
afc7064f: raises 1,320 to 2,520
de10679c: folds
471910c: calls 2,520
Hero: folds
f123395: folds
392ff24f: calls 1,320
*** FLOP *** [4c 3d As]
392ff24f: checks
afc7064f: checks
471910c: checks
*** TURN *** [4c 3d As] [Jd]
392ff24f: checks
afc7064f: checks
471910c: bets 4,800
392ff24f: folds
afc7064f: folds
Uncalled bet (4,800) returned to 471910c
*** SHOWDOWN ***
471910c collected 9,210 from pot
*** SUMMARY ***
Total pot 9,210 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [4c 3d As Jd]
Seat 1: f123395 (small blind) folded before Flop
Seat 2: 392ff24f (big blind) folded on the Turn
Seat 3: 84466c0e folded before Flop
Seat 4: afc7064f folded on the Turn
Seat 5: de10679c folded before Flop
Seat 6: 471910c won (9,210)
Seat 7: Hero (button) folded before Flop
`.trim()

  it('should parse hand history correctly', () => {
    const results = parseHandHistory(sampleHandHistory)
    expect(results).toHaveLength(1)

    const hand = results[0]

    // Basic info
    expect(hand.id).toBe('TM4832872904')
    expect(hand.tournamentId).toBe(220597937)
    expect(hand.tournamentName).toBe("Zodiac Dog Ultra Deepstack 7-Max ¥110 [Turbo] Hold'em No Limit")
    expect(hand.level).toBe(16)
    expect(hand.sb).toBe(600)
    expect(hand.bb).toBe(1200)
    expect(hand.buttonSeat).toBe(7)
    expect(hand.maxSeats).toBe(7)
    expect(hand.tableId).toBe('25')

    // Datetime
    expect(hand.datetime.getFullYear()).toBe(2025)
    expect(hand.datetime.getMonth()).toBe(7) // August (0-indexed)
    expect(hand.datetime.getDate()).toBe(1)
    expect(hand.datetime.getHours()).toBe(0)
    expect(hand.datetime.getMinutes()).toBe(53)
    expect(hand.datetime.getSeconds()).toBe(29)

    // Blinds seats
    expect(hand.sbSeat).toBe(1)
    expect(hand.bbSeat).toBe(2)

    // Community cards
    expect(hand.communityCards).toEqual(['4c', '3d', 'As', 'Jd'])

    // Known cards
    expect(hand.knownCards.size).toBe(1)
    expect(hand.knownCards.get('Hero')).toEqual(['Jh', '8c'])

    // Seats
    expect(hand.seats.size).toBe(7)
    expect(hand.seats.get(1)).toEqual(['f123395', 43493])
    expect(hand.seats.get(7)).toEqual(['Hero', 22175])

    // Winnings
    expect(hand.wons.get('471910c')).toBe(9210)

    // Uncalled bet
    expect(hand.uncalledReturned).toEqual(['471910c', 4800])
  })

  it('should parse preflop actions correctly', () => {
    const results = parseHandHistory(sampleHandHistory)
    const hand = results[0]

    // Check antes
    const antes = hand.actionsPreflop.filter(a => a.action === 'ante')
    expect(antes).toHaveLength(7)
    expect(antes.every(a => a.amount === 150)).toBe(true)

    // Check blinds
    const blinds = hand.actionsPreflop.filter(a => a.action === 'blind')
    expect(blinds).toHaveLength(2)
    expect(blinds[0]).toEqual({ playerId: 'f123395', action: 'blind', amount: 600, isAllIn: false })
    expect(blinds[1]).toEqual({ playerId: '392ff24f', action: 'blind', amount: 1200, isAllIn: false })

    // Check betting actions
    const raises = hand.actionsPreflop.filter(a => a.action === 'raise')
    expect(raises).toHaveLength(1)
    expect(raises[0].playerId).toBe('afc7064f')
    expect(raises[0].amount).toBe(2520) // "to" amount

    const calls = hand.actionsPreflop.filter(a => a.action === 'call')
    expect(calls).toHaveLength(2)
  })

  it('should parse flop actions correctly', () => {
    const results = parseHandHistory(sampleHandHistory)
    const hand = results[0]

    expect(hand.actionsFlop).toHaveLength(3)
    expect(hand.actionsFlop.every(a => a.action === 'check')).toBe(true)
  })

  it('should parse turn actions correctly', () => {
    const results = parseHandHistory(sampleHandHistory)
    const hand = results[0]

    expect(hand.actionsTurn).toHaveLength(5)

    const checks = hand.actionsTurn.filter(a => a.action === 'check')
    expect(checks).toHaveLength(2)

    const bets = hand.actionsTurn.filter(a => a.action === 'bet')
    expect(bets).toHaveLength(1)
    expect(bets[0].playerId).toBe('471910c')
    expect(bets[0].amount).toBe(4800)

    const folds = hand.actionsTurn.filter(a => a.action === 'fold')
    expect(folds).toHaveLength(2)
  })

  it('should have no river actions since everyone folded on turn', () => {
    const results = parseHandHistory(sampleHandHistory)
    const hand = results[0]

    expect(hand.actionsRiver).toHaveLength(0)
  })

  it('should handle empty input', () => {
    const results = parseHandHistory('')
    expect(results).toHaveLength(0)
  })

  it('should parse new format with ante in level info', () => {
    const newFormatHand = `
Poker Hand #TM5890117982: Tournament #280241902, Daily Special $3 Hold'em No Limit - Level10(250/500(60)) - 2026/04/30 22:25:46
Table '53' 8-max Seat #5 is the button
Seat 1: 5ad653e7 (20,480 in chips)
Seat 2: ba03baf9 (5,205 in chips)
Seat 3: Hero (19,050 in chips)
5ad653e7: posts the ante 60
ba03baf9: posts the ante 60
Hero: posts the ante 60
5ad653e7: posts small blind 250
ba03baf9: posts big blind 500
*** HOLE CARDS ***
Dealt to 5ad653e7
Dealt to ba03baf9
Dealt to Hero [8c Tc]
Hero: raises 500 to 1,000
5ad653e7: folds
ba03baf9: folds
Uncalled bet (500) returned to Hero
*** SHOWDOWN ***
Hero collected 1,180 from pot
*** SUMMARY ***
Total pot 1,180 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Seat 1: 5ad653e7 (small blind) folded before Flop
Seat 2: ba03baf9 (big blind) folded before Flop
Seat 3: Hero won (1,180)
`.trim()

    const results = parseHandHistory(newFormatHand)
    expect(results).toHaveLength(1)

    const hand = results[0]
    expect(hand.id).toBe('TM5890117982')
    expect(hand.tournamentId).toBe(280241902)
    expect(hand.level).toBe(10)
    expect(hand.sb).toBe(250)
    expect(hand.bb).toBe(500)
    expect(hand.maxSeats).toBe(8)
    expect(hand.buttonSeat).toBe(5)
    expect(hand.datetime.getFullYear()).toBe(2026)
    expect(hand.datetime.getMonth()).toBe(3) // April (0-indexed)

    // Antes parsed from action lines
    const antes = hand.actionsPreflop.filter(a => a.action === 'ante')
    expect(antes).toHaveLength(3)
    expect(antes.every(a => a.amount === 60)).toBe(true)

    expect(hand.wons.get('Hero')).toBe(1180)
    expect(hand.uncalledReturned).toEqual(['Hero', 500])
  })

  it('should parse new format with large ante (Flipout)', () => {
    const flipoutHand = `
Poker Hand #TM5760010691: Tournament #274416465, Daily $100,000 #ThanksGG Flipout Hold'em No Limit - Level1(500/1,000(2,000,000,000)) - 2026/04/04 17:45:02
Table '1' 8-max Seat #3 is the button
Seat 1: abc12345 (10,000 in chips)
Seat 2: Hero (10,000 in chips)
abc12345: posts the ante 2,000,000,000
Hero: posts the ante 2,000,000,000
abc12345: posts small blind 500
Hero: posts big blind 1,000
*** HOLE CARDS ***
Dealt to abc12345
Dealt to Hero [As Kd]
abc12345: folds
Uncalled bet (500) returned to Hero
*** SHOWDOWN ***
Hero collected 4,000,001,000 from pot
*** SUMMARY ***
Total pot 4,000,001,000 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Seat 1: abc12345 (small blind) folded before Flop
Seat 2: Hero (big blind) won (4,000,001,000)
`.trim()

    const results = parseHandHistory(flipoutHand)
    expect(results).toHaveLength(1)

    const hand = results[0]
    expect(hand.sb).toBe(500)
    expect(hand.bb).toBe(1000)
    expect(hand.level).toBe(1)

    const antes = hand.actionsPreflop.filter(a => a.action === 'ante')
    expect(antes).toHaveLength(2)
    expect(antes[0].amount).toBe(2000000000)
  })
})
