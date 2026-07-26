import { describe, it, expect } from 'vitest'
import { parseHandHistory } from '../parser/handHistoryParser'
import { getHandHistoryAllInShowdownStreet } from './index'

/**
 * Scenario tests for all-in showdown detection, driven by raw GG hand text so
 * the parser's "and is all-in" tagging (and its absence on covering calls) is
 * part of what is tested.
 */

function heroStreet(handText: string) {
  const hands = parseHandHistory(handText.trim() + '\n')
  expect(hands).toHaveLength(1)
  return getHandHistoryAllInShowdownStreet(hands[0], 'Hero')
}

// Scenario 1: heads-up, opponent shoves, Hero calls covering — no all-in tag
// on Hero's line, but betting is closed so this is an all-in showdown.
const HU_HERO_COVERS_CALL = `
Poker Hand #SG1000000001: Tournament #900000001, Spin&Gold #4 Hold'em No Limit - Level2(15/30) - 2025/09/29 00:43:35
Table '12470' 3-max Seat #1 is the button
Seat 1: aaaa1111 (360 in chips)
Seat 3: Hero (540 in chips)
aaaa1111: posts small blind 15
Hero: posts big blind 30
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to Hero [Qs Ks]
aaaa1111: raises 330 to 360 and is all-in
Hero: calls 330
aaaa1111: shows [7s 7h]
Hero: shows [Qs Ks]
*** FLOP *** [Tc Qh As]
*** TURN *** [Tc Qh As] [Qc]
*** RIVER *** [Tc Qh As Qc] [9c]
*** SHOWDOWN ***
Hero collected 720 from pot
*** SUMMARY ***
Total pot 720 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Tc Qh As Qc 9c]
Seat 1: aaaa1111 (small blind) showed [7s 7h] and lost with two pair, Queens and Sevens
Seat 3: Hero (big blind) showed [Qs Ks] and won (720) with three of a kind, Queens
`

// Scenario 2: heads-up, Hero shoves and is called.
const HU_HERO_SHOVES = `
Poker Hand #SG1000000002: Tournament #900000001, Spin&Gold #4 Hold'em No Limit - Level2(15/30) - 2025/09/29 00:44:35
Table '12470' 3-max Seat #1 is the button
Seat 1: aaaa1111 (540 in chips)
Seat 3: Hero (360 in chips)
aaaa1111: posts small blind 15
Hero: posts big blind 30
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to Hero [Qs Ks]
aaaa1111: calls 15
Hero: raises 330 to 360 and is all-in
aaaa1111: calls 330
aaaa1111: shows [7s 7h]
Hero: shows [Qs Ks]
*** FLOP *** [Tc Qh As]
*** TURN *** [Tc Qh As] [Qc]
*** RIVER *** [Tc Qh As Qc] [9c]
*** SHOWDOWN ***
Hero collected 720 from pot
*** SUMMARY ***
Total pot 720 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Tc Qh As Qc 9c]
Seat 1: aaaa1111 (small blind) showed [7s 7h] and lost with two pair, Queens and Sevens
Seat 3: Hero (big blind) showed [Qs Ks] and won (720) with three of a kind, Queens
`

// Scenario 3: multi-way, both opponents shove, Hero calls covering everyone.
const MW_HERO_COVERS_CALL = `
Poker Hand #TM1000000003: Tournament #900000002, Test Tournament Hold'em No Limit - Level5(100/200) - 2025/09/29 01:00:00
Table '1' 6-max Seat #1 is the button
Seat 1: aaaa1111 (2,000 in chips)
Seat 2: bbbb2222 (3,000 in chips)
Seat 3: Hero (10,000 in chips)
aaaa1111: posts small blind 100
bbbb2222: posts big blind 200
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to bbbb2222
Dealt to Hero [As Ad]
Hero: raises 200 to 400
aaaa1111: raises 1,600 to 2,000 and is all-in
bbbb2222: raises 1,000 to 3,000 and is all-in
Hero: calls 2,600
aaaa1111: shows [Kd Kc]
bbbb2222: shows [Qh Qd]
Hero: shows [As Ad]
*** FLOP *** [2c 5h 9s]
*** TURN *** [2c 5h 9s] [Jd]
*** RIVER *** [2c 5h 9s Jd] [3c]
*** SHOWDOWN ***
Hero collected 2,000 from pot
Hero collected 6,000 from pot
*** SUMMARY ***
Total pot 8,000 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [2c 5h 9s Jd 3c]
Seat 1: aaaa1111 (small blind) showed [Kd Kc] and lost with a pair of Kings
Seat 2: bbbb2222 (big blind) showed [Qh Qd] and lost with a pair of Queens
Seat 3: Hero (button) showed [As Ad] and won (8,000) with a pair of Aces
`

// Scenario 4: multi-way, Hero and one opponent shove, the big stack calls.
const MW_HERO_SHOVES_BIGSTACK_CALLS = `
Poker Hand #TM1000000004: Tournament #900000002, Test Tournament Hold'em No Limit - Level5(100/200) - 2025/09/29 01:05:00
Table '1' 6-max Seat #1 is the button
Seat 1: aaaa1111 (2,000 in chips)
Seat 2: bbbb2222 (10,000 in chips)
Seat 3: Hero (3,000 in chips)
aaaa1111: posts small blind 100
bbbb2222: posts big blind 200
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to bbbb2222
Dealt to Hero [As Ad]
Hero: raises 2,800 to 3,000 and is all-in
aaaa1111: calls 1,900 and is all-in
bbbb2222: calls 2,800
aaaa1111: shows [Kd Kc]
bbbb2222: shows [Qh Qd]
Hero: shows [As Ad]
*** FLOP *** [2c 5h 9s]
*** TURN *** [2c 5h 9s] [Jd]
*** RIVER *** [2c 5h 9s Jd] [3c]
*** SHOWDOWN ***
Hero collected 2,000 from pot
Hero collected 6,000 from pot
*** SUMMARY ***
Total pot 8,000 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [2c 5h 9s Jd 3c]
Seat 1: aaaa1111 (small blind) showed [Kd Kc] and lost with a pair of Kings
Seat 2: bbbb2222 (big blind) showed [Qh Qd] and lost with a pair of Queens
Seat 3: Hero (button) showed [As Ad] and won (8,000) with a pair of Aces
`

// Scenario 5: Hero shoves preflop, two live callers keep betting a side pot
// on later streets. Hero is all-in, so the hand qualifies at Hero's street.
const MW_HERO_SHOVES_SIDE_POT_CONTINUES = `
Poker Hand #BR1000000005: Tournament #900000003, Mystery Battle Royale $25 Hold'em No Limit - Level3(30/60) - 2025/10/16 14:06:29
Table '35' 5-max Seat #1 is the button
Seat 1: Hero (99 in chips)
Seat 2: aaaa1111 (1,449 in chips)
Seat 3: bbbb2222 (3,160 in chips)
aaaa1111: posts small blind 30
bbbb2222: posts big blind 60
*** HOLE CARDS ***
Dealt to Hero [7h Td]
Dealt to aaaa1111
Dealt to bbbb2222
Hero: raises 39 to 99 and is all-in
aaaa1111: calls 69
bbbb2222: calls 39
*** FLOP *** [As Kd 5s]
aaaa1111: bets 106
bbbb2222: calls 106
*** TURN *** [As Kd 5s] [6d]
aaaa1111: checks
bbbb2222: checks
*** RIVER *** [As Kd 5s 6d] [9h]
aaaa1111: bets 267
bbbb2222: calls 267
aaaa1111: shows [Kh 6h] (two pair, Kings and Sixes)
bbbb2222: shows [Tc Kc] (a pair of Kings)
Hero: shows [7h Td] (Ace high)
*** SHOWDOWN ***
aaaa1111 collected 1,043 from pot
*** SUMMARY ***
Total pot 1,043 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [As Kd 5s 6d 9h]
Seat 1: Hero (button) showed [7h Td] and lost with Ace high
Seat 2: aaaa1111 (small blind) showed [Kh 6h] and won (1,043) with two pair, Kings and Sixes
Seat 3: bbbb2222 (big blind) showed [Tc Kc] and lost with a pair of Kings
`

// Hero covers a turn shove: the covering-call rule must pick the turn, not
// an earlier street.
const HU_HERO_COVERS_TURN_SHOVE = `
Poker Hand #SG1000000006: Tournament #900000001, Spin&Gold #4 Hold'em No Limit - Level2(15/30) - 2025/09/29 00:50:00
Table '12470' 3-max Seat #1 is the button
Seat 1: aaaa1111 (360 in chips)
Seat 3: Hero (540 in chips)
aaaa1111: posts small blind 15
Hero: posts big blind 30
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to Hero [Qs Ks]
aaaa1111: calls 15
Hero: checks
*** FLOP *** [Tc Qh As]
Hero: checks
aaaa1111: checks
*** TURN *** [Tc Qh As] [Qc]
Hero: checks
aaaa1111: bets 330 and is all-in
Hero: calls 330
aaaa1111: shows [7s 7h]
Hero: shows [Qs Ks]
*** RIVER *** [Tc Qh As Qc] [9c]
*** SHOWDOWN ***
Hero collected 720 from pot
*** SUMMARY ***
Total pot 720 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Tc Qh As Qc 9c]
Seat 1: aaaa1111 (small blind) showed [7s 7h] and lost with two pair, Queens and Sevens
Seat 3: Hero (big blind) showed [Qs Ks] and won (720) with three of a kind, Queens
`

// Not an all-in showdown: normal betting reaches showdown with chips behind.
const NO_ALL_IN_SHOWDOWN = `
Poker Hand #SG1000000007: Tournament #900000001, Spin&Gold #4 Hold'em No Limit - Level2(15/30) - 2025/09/29 00:55:00
Table '12470' 3-max Seat #1 is the button
Seat 1: aaaa1111 (500 in chips)
Seat 3: Hero (500 in chips)
aaaa1111: posts small blind 15
Hero: posts big blind 30
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to Hero [Qs Ks]
aaaa1111: calls 15
Hero: checks
*** FLOP *** [Tc Qh As]
Hero: bets 60
aaaa1111: calls 60
*** TURN *** [Tc Qh As] [Qc]
Hero: checks
aaaa1111: checks
*** RIVER *** [Tc Qh As Qc] [9c]
Hero: bets 90
aaaa1111: calls 90
Hero: shows [Qs Ks]
aaaa1111: shows [7s 7h]
*** SHOWDOWN ***
Hero collected 360 from pot
*** SUMMARY ***
Total pot 360 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Tc Qh As Qc 9c]
Seat 1: aaaa1111 (small blind) showed [7s 7h] and lost with two pair, Queens and Sevens
Seat 3: Hero (big blind) showed [Qs Ks] and won (360) with three of a kind, Queens
`

// Hero posts the big blind all-in (short stack). The action is flagged by the
// parser's postprocess but never reaches h.allIned; the helper must still
// treat Hero as all-in preflop.
const HERO_BLIND_ALL_IN = `
Poker Hand #SG1000000008: Tournament #900000001, Spin&Gold #4 Hold'em No Limit - Level2(15/30) - 2025/09/29 00:58:00
Table '12470' 3-max Seat #1 is the button
Seat 1: aaaa1111 (875 in chips)
Seat 3: Hero (25 in chips)
aaaa1111: posts small blind 15
Hero: posts big blind 25
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to Hero [Qs Ks]
aaaa1111: calls 10
aaaa1111: shows [7s 7h]
Hero: shows [Qs Ks]
*** FLOP *** [Tc Qh As]
*** TURN *** [Tc Qh As] [Qc]
*** RIVER *** [Tc Qh As Qc] [9c]
*** SHOWDOWN ***
Hero collected 50 from pot
*** SUMMARY ***
Total pot 50 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Tc Qh As Qc 9c]
Seat 1: aaaa1111 (small blind) showed [7s 7h] and lost with two pair, Queens and Sevens
Seat 3: Hero (big blind) showed [Qs Ks] and won (50) with three of a kind, Queens
`

// Opponent is all-in from posting a short small blind (no GG tag; only the
// parser postprocess flags it). Hero covers — must qualify at preflop.
const OPPONENT_BLIND_ALL_IN_HERO_COVERS = `
Poker Hand #SG1000000010: Tournament #900000001, Spin&Gold #4 Hold'em No Limit - Level2(15/30) - 2025/09/29 01:01:00
Table '12470' 3-max Seat #1 is the button
Seat 1: aaaa1111 (10 in chips)
Seat 3: Hero (890 in chips)
aaaa1111: posts small blind 10
Hero: posts big blind 30
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to Hero [Qs Ks]
Uncalled bet (20) returned to Hero
aaaa1111: shows [7s 7h]
Hero: shows [Qs Ks]
*** FLOP *** [Tc Qh As]
*** TURN *** [Tc Qh As] [Qc]
*** RIVER *** [Tc Qh As Qc] [9c]
*** SHOWDOWN ***
Hero collected 20 from pot
*** SUMMARY ***
Total pot 20 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Tc Qh As Qc 9c]
Seat 1: aaaa1111 (small blind) showed [7s 7h] and lost with two pair, Queens and Sevens
Seat 3: Hero (big blind) showed [Qs Ks] and won (20) with three of a kind, Queens
`

// Hero is all-in from posting a short ante (flagged only by postprocess).
const HERO_ANTE_ALL_IN = `
Poker Hand #TM1000000011: Tournament #900000002, Test Tournament Hold'em No Limit - Level10(600/1200) - 2025/09/29 01:10:00
Table '1' 6-max Seat #1 is the button
Seat 1: aaaa1111 (30,000 in chips)
Seat 2: bbbb2222 (30,000 in chips)
Seat 3: Hero (40 in chips)
aaaa1111: posts the ante 150
bbbb2222: posts the ante 150
Hero: posts the ante 40
aaaa1111: posts small blind 600
bbbb2222: posts big blind 1,200
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to bbbb2222
Dealt to Hero [Qs Ks]
aaaa1111: folds
Hero: shows [Qs Ks]
bbbb2222: shows [7s 7h]
*** FLOP *** [Tc Qh As]
*** TURN *** [Tc Qh As] [Qc]
*** RIVER *** [Tc Qh As Qc] [9c]
*** SHOWDOWN ***
Hero collected 120 from pot
*** SUMMARY ***
Total pot 120 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Tc Qh As Qc 9c]
Seat 1: aaaa1111 (small blind) folded before Flop
Seat 2: bbbb2222 (big blind) showed [7s 7h] and lost with two pair, Queens and Sevens
Seat 3: Hero (button) showed [Qs Ks] and won (120) with three of a kind, Queens
`

// Covering call on the flop resolves to the flop.
const HU_HERO_COVERS_FLOP_SHOVE = `
Poker Hand #SG1000000012: Tournament #900000001, Spin&Gold #4 Hold'em No Limit - Level2(15/30) - 2025/09/29 01:12:00
Table '12470' 3-max Seat #1 is the button
Seat 1: aaaa1111 (360 in chips)
Seat 3: Hero (540 in chips)
aaaa1111: posts small blind 15
Hero: posts big blind 30
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to Hero [Qs Ks]
aaaa1111: calls 15
Hero: checks
*** FLOP *** [Tc Qh As]
Hero: checks
aaaa1111: bets 330 and is all-in
Hero: calls 330
aaaa1111: shows [7s 7h]
Hero: shows [Qs Ks]
*** TURN *** [Tc Qh As] [Qc]
*** RIVER *** [Tc Qh As Qc] [9c]
*** SHOWDOWN ***
Hero collected 720 from pot
*** SUMMARY ***
Total pot 720 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Tc Qh As Qc 9c]
Seat 1: aaaa1111 (small blind) showed [7s 7h] and lost with two pair, Queens and Sevens
Seat 3: Hero (big blind) showed [Qs Ks] and won (720) with three of a kind, Queens
`

// One opponent is all-in but a second opponent stays live with chips behind
// (checked down to showdown). Hero also has chips — never an all-in showdown
// for Hero, even though everyone reaches showdown.
const MW_SECOND_OPPONENT_STAYS_LIVE = `
Poker Hand #TM1000000013: Tournament #900000002, Test Tournament Hold'em No Limit - Level5(100/200) - 2025/09/29 01:13:00
Table '1' 6-max Seat #1 is the button
Seat 1: aaaa1111 (300 in chips)
Seat 2: bbbb2222 (10,000 in chips)
Seat 3: Hero (10,000 in chips)
aaaa1111: posts small blind 100
bbbb2222: posts big blind 200
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to bbbb2222
Dealt to Hero [As Ad]
Hero: calls 200
aaaa1111: raises 100 to 300 and is all-in
bbbb2222: calls 100
Hero: calls 100
*** FLOP *** [2c 5h 9s]
bbbb2222: checks
Hero: checks
*** TURN *** [2c 5h 9s] [Jd]
bbbb2222: checks
Hero: checks
*** RIVER *** [2c 5h 9s Jd] [3c]
bbbb2222: checks
Hero: checks
aaaa1111: shows [Kd Kc]
bbbb2222: shows [Qh Qd]
Hero: shows [As Ad]
*** SHOWDOWN ***
Hero collected 900 from pot
*** SUMMARY ***
Total pot 900 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [2c 5h 9s Jd 3c]
Seat 1: aaaa1111 (small blind) showed [Kd Kc] and lost with a pair of Kings
Seat 2: bbbb2222 (big blind) showed [Qh Qd] and lost with a pair of Queens
Seat 3: Hero (button) showed [As Ad] and won (900) with a pair of Aces
`

// River shove covered by Hero: the helper reports 'river'; excluding river
// all-ins from the equity chart is the callers' policy, not the helper's.
const HU_HERO_COVERS_RIVER_SHOVE = `
Poker Hand #SG1000000014: Tournament #900000001, Spin&Gold #4 Hold'em No Limit - Level2(15/30) - 2025/09/29 01:14:00
Table '12470' 3-max Seat #1 is the button
Seat 1: aaaa1111 (360 in chips)
Seat 3: Hero (540 in chips)
aaaa1111: posts small blind 15
Hero: posts big blind 30
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to Hero [Qs Ks]
aaaa1111: calls 15
Hero: checks
*** FLOP *** [Tc Qh As]
Hero: checks
aaaa1111: checks
*** TURN *** [Tc Qh As] [Qc]
Hero: checks
aaaa1111: checks
*** RIVER *** [Tc Qh As Qc] [9c]
Hero: checks
aaaa1111: bets 330 and is all-in
Hero: calls 330
aaaa1111: shows [7s 7h]
Hero: shows [Qs Ks]
*** SHOWDOWN ***
Hero collected 720 from pot
*** SUMMARY ***
Total pot 720 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Tc Qh As Qc 9c]
Seat 1: aaaa1111 (small blind) showed [7s 7h] and lost with two pair, Queens and Sevens
Seat 3: Hero (big blind) showed [Qs Ks] and won (720) with three of a kind, Queens
`

// Hero folds to the shove — no showdown for Hero, must not qualify.
const HERO_FOLDS_TO_SHOVE = `
Poker Hand #SG1000000009: Tournament #900000001, Spin&Gold #4 Hold'em No Limit - Level2(15/30) - 2025/09/29 00:59:00
Table '12470' 3-max Seat #1 is the button
Seat 1: aaaa1111 (360 in chips)
Seat 3: Hero (540 in chips)
aaaa1111: posts small blind 15
Hero: posts big blind 30
*** HOLE CARDS ***
Dealt to aaaa1111
Dealt to Hero [Qs 2d]
aaaa1111: raises 330 to 360 and is all-in
Hero: folds
Uncalled bet (330) returned to aaaa1111
*** SHOWDOWN ***
aaaa1111 collected 60 from pot
*** SUMMARY ***
Total pot 60 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Seat 1: aaaa1111 (small blind) won (60)
Seat 3: Hero (big blind) folded before Flop
`

describe('getHandHistoryAllInShowdownStreet', () => {
  it('scenario 1: HU, opponent shoves, Hero calls covering', () => {
    expect(heroStreet(HU_HERO_COVERS_CALL)).toBe('preflop')
  })

  it('scenario 2: HU, Hero shoves, opponent calls', () => {
    expect(heroStreet(HU_HERO_SHOVES)).toBe('preflop')
  })

  it('scenario 3: multi-way, everyone else shoves, Hero calls covering', () => {
    expect(heroStreet(MW_HERO_COVERS_CALL)).toBe('preflop')
  })

  it('scenario 4: multi-way, Hero shoves, big stack calls', () => {
    expect(heroStreet(MW_HERO_SHOVES_BIGSTACK_CALLS)).toBe('preflop')
  })

  it('scenario 5: Hero all-in, side pot continues — qualifies at Hero street', () => {
    expect(heroStreet(MW_HERO_SHOVES_SIDE_POT_CONTINUES)).toBe('preflop')
  })

  it('covering call on the turn resolves to the turn, not earlier', () => {
    expect(heroStreet(HU_HERO_COVERS_TURN_SHOVE)).toBe('turn')
  })

  it('regular showdown with chips behind does not qualify', () => {
    expect(heroStreet(NO_ALL_IN_SHOWDOWN)).toBeNull()
  })

  it('Hero all-in from posting the big blind qualifies', () => {
    expect(heroStreet(HERO_BLIND_ALL_IN)).toBe('preflop')
  })

  it('Hero folding to a shove does not qualify', () => {
    expect(heroStreet(HERO_FOLDS_TO_SHOVE)).toBeNull()
  })

  it('Hero covering an opponent all-in from a short blind qualifies', () => {
    expect(heroStreet(OPPONENT_BLIND_ALL_IN_HERO_COVERS)).toBe('preflop')
  })

  it('Hero all-in from posting a short ante qualifies', () => {
    expect(heroStreet(HERO_ANTE_ALL_IN)).toBe('preflop')
  })

  it('covering call on the flop resolves to the flop', () => {
    expect(heroStreet(HU_HERO_COVERS_FLOP_SHOVE)).toBe('flop')
  })

  it('a second live opponent with chips behind prevents qualification', () => {
    expect(heroStreet(MW_SECOND_OPPONENT_STAYS_LIVE)).toBeNull()
  })

  it('river covering call reports river (callers exclude it)', () => {
    expect(heroStreet(HU_HERO_COVERS_RIVER_SHOVE)).toBe('river')
  })
})
