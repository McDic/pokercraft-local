/**
 * The contract of preflopSituation.ts, and above all the identity it rests on:
 * **folding scores exactly zero, at every decision node.**
 *
 * That identity is what makes Δbb trustworthy. Δ is defined as the gain over folding, so
 * if the fold line itself ever scores anything but 0, the chip accounting is wrong — a
 * miscounted ante, a raise added where it should have replaced — and every Δ in the chart
 * is off by that amount, silently and plausibly. It is far easier to see here than in a
 * heatmap, so the fold cases below are deliberately the awkward ones.
 */

import { describe, it, expect } from 'vitest'
import type { BetAction, HandHistory } from '../types'
import { makeHandHistory } from '../test/fixtures'
import { HERO, classifyHand, classifyHandHistories, toOpenerBucket } from './preflopSituation'

const SB = 10
const BB = 20
const ANTE = 2 // uniform: every seat posts one, which is what online tournaments actually do

/**
 * Six-handed, seats 1..6, button on 1. That fixes the positions the tests name:
 * seat 1 = BTN (0), 2 = SB (1), 3 = BB (2), 4 = MP (-3), 5 = MP+1 (-2), 6 = CO (-1).
 */
function seats(heroSeat: number, heroStack = 2000): Map<number, [string, number]> {
  const m = new Map<number, [string, number]>()
  for (let s = 1; s <= 6; s++) {
    m.set(s, s === heroSeat ? [HERO, heroStack] : [`v${s}`, 2000])
  }
  return m
}

/** Who sits where, given Hero's seat — so tests can say `p(heroSeat).co` instead of counting. */
function p(heroSeat: number) {
  const name = (s: number) => (s === heroSeat ? HERO : `v${s}`)
  return { btn: name(1), sb: name(2), bb: name(3), mp: name(4), mp1: name(5), co: name(6) }
}

/** The uniform ante from every seat, then the two blinds. Always precedes voluntary action. */
function posts(heroSeat: number, heroBlindAllIn = false): BetAction[] {
  const name = (s: number) => (s === heroSeat ? HERO : `v${s}`)
  const out: BetAction[] = []
  for (let s = 1; s <= 6; s++) {
    out.push({ playerId: name(s), action: 'ante', amount: ANTE, isAllIn: false })
  }
  out.push({ playerId: name(2), action: 'blind', amount: SB, isAllIn: false })
  out.push({
    playerId: name(3),
    action: 'blind',
    amount: BB,
    isAllIn: heroBlindAllIn && heroSeat === 3,
  })
  return out
}

const fold = (id: string): BetAction => ({ playerId: id, action: 'fold', amount: 0, isAllIn: false })
const check = (id: string): BetAction => ({ playerId: id, action: 'check', amount: 0, isAllIn: false })
const call = (id: string, amount: number): BetAction => ({ playerId: id, action: 'call', amount, isAllIn: false })
/** `amount` is the *to* total, matching what the parser stores. */
const raise = (id: string, amount: number, isAllIn = false): BetAction => ({ playerId: id, action: 'raise', amount, isAllIn })
const bet = (id: string, amount: number): BetAction => ({ playerId: id, action: 'bet', amount, isAllIn: false })

function hand(overrides: Partial<HandHistory>): HandHistory {
  return makeHandHistory('TM1', { sb: SB, bb: BB, buttonSeat: 1, sbSeat: 2, bbSeat: 3, maxSeats: 6, ...overrides })
}

describe('classifyHand', () => {
  describe('the fold identity', () => {
    // Each of these ends with Hero folding somewhere. Whatever else the hand did, the fold
    // node must score 0 — that is the definition of the baseline it is measured against.
    const cases: Array<[string, HandHistory]> = [
      [
        'big blind folds to an open (posted a blind and an ante)',
        hand({
          seats: seats(3),
          actionsPreflop: [
            ...posts(3),
            fold(p(3).mp), fold(p(3).mp1),
            raise(p(3).co, 50),
            fold(p(3).btn), fold(p(3).sb),
            fold(HERO),
          ],
          wons: new Map([[p(3).co, 92]]),
        }),
      ],
      [
        'cutoff folds having posted only an ante',
        hand({
          seats: seats(6),
          actionsPreflop: [
            ...posts(6),
            fold(p(6).mp), fold(p(6).mp1),
            fold(HERO),
            fold(p(6).btn), fold(p(6).sb),
          ],
          wons: new Map([[p(6).bb, 42]]),
        }),
      ],
      [
        'cutoff opens, then folds to a 3-bet (the second node is the fold)',
        hand({
          seats: seats(6),
          actionsPreflop: [
            ...posts(6),
            fold(p(6).mp), fold(p(6).mp1),
            raise(HERO, 50),
            raise(p(6).btn, 150),
            fold(p(6).sb), fold(p(6).bb),
            fold(HERO),
          ],
          wons: new Map([[p(6).btn, 92]]),
        }),
      ],
      [
        'big blind defends, then folds the flop (fold is postflop, so no preflop fold node)',
        hand({
          seats: seats(3),
          actionsPreflop: [
            ...posts(3),
            fold(p(3).mp), fold(p(3).mp1), fold(p(3).co),
            raise(p(3).btn, 50),
            fold(p(3).sb),
            call(HERO, 30),
          ],
          actionsFlop: [check(HERO), bet(p(3).btn, 60), fold(HERO)],
          wons: new Map([[p(3).btn, 172]]),
        }),
      ],
      [
        'small blind folds having posted half a blind',
        hand({
          seats: seats(2),
          actionsPreflop: [
            ...posts(2),
            fold(p(2).mp), fold(p(2).mp1), fold(p(2).co),
            raise(p(2).btn, 50),
            fold(HERO),
          ],
          wons: new Map([[p(2).btn, 92]]),
        }),
      ],
    ]

    it.each(cases)('%s', (_name, h) => {
      const folds = classifyHand(h).filter(s => s.action === 'fold')
      for (const s of folds) {
        expect(s.deltaBB, 'folding must be the zero of this scale').toBe(0)
      }
    })

    it('finds a fold node in every case that has one', () => {
      // Guards the suite above against passing vacuously: four of the five hands contain a
      // preflop fold by Hero, and the fifth (a flop fold) deliberately contains none.
      const withFolds = cases.filter(([, h]) => classifyHand(h).some(s => s.action === 'fold'))
      expect(withFolds).toHaveLength(4)
    })
  })

  it('scores a big-blind defence against the fold baseline, not against zero', () => {
    // BB posts 20 + 2 ante, calls a 50 open, folds the flop. Raw profit is −52, but folding
    // preflop would already have cost 22 — so the call is only 30 chips (1.5bb) worse than
    // folding, and that is the number a defence chart has to show.
    const h = hand({
      seats: seats(3),
      actionsPreflop: [
        ...posts(3),
        fold(p(3).mp), fold(p(3).mp1), fold(p(3).co),
        raise(p(3).btn, 50),
        fold(p(3).sb),
        call(HERO, 30),
      ],
      actionsFlop: [check(HERO), bet(p(3).btn, 60), fold(HERO)],
      wons: new Map([[p(3).btn, 172]]),
    })

    const [s] = classifyHand(h)
    expect(s.context).toBe('raised')
    expect(s.action).toBe('call')
    expect(s.heroOffset).toBe(2) // BB
    expect(s.openerBucket).toBe('lp') // BTN
    expect(s.raiseToBB).toBe(2.5)
    expect(s.deltaBB).toBe(-1.5)
  })

  it('charges an open that folds to a 3-bet to the open, and nothing to the fold', () => {
    // The two nodes answer different questions. Opening and surrendering cost 2.5bb versus
    // never opening; folding *once 3-bet* cost nothing versus folding, which is the point.
    const h = hand({
      seats: seats(6),
      actionsPreflop: [
        ...posts(6),
        fold(p(6).mp), fold(p(6).mp1),
        raise(HERO, 50),
        raise(p(6).btn, 150),
        fold(p(6).sb), fold(p(6).bb),
        fold(HERO),
      ],
      wons: new Map([[p(6).btn, 92]]),
    })

    const [open, facing3bet] = classifyHand(h)
    expect(open.context).toBe('unopened')
    expect(open.action).toBe('raise')
    expect(open.deltaBB).toBe(-2.5)

    expect(facing3bet.context).toBe('threeBet')
    expect(facing3bet.action).toBe('fold')
    expect(facing3bet.openerBucket).toBe('lp') // the 3-bettor, on the button
    expect(facing3bet.raiseToBB).toBe(7.5)
    expect(facing3bet.deltaBB).toBe(0)
  })

  it('credits an uncalled open with only the chips it actually risked', () => {
    // Hero opens to 50 from CO and takes it down. 30 comes straight back as an uncalled bet,
    // so the voluntary investment was 20 against a 56 pot: Δ = 56 − 20 = 36 = 1.8bb. This is
    // the path where a naive `raise`-adds-to-commitment would drift, so it is pinned.
    const h = hand({
      seats: seats(6),
      actionsPreflop: [
        ...posts(6),
        fold(p(6).mp), fold(p(6).mp1),
        raise(HERO, 50),
        fold(p(6).btn), fold(p(6).sb), fold(p(6).bb),
      ],
      uncalledReturned: [HERO, 30],
      wons: new Map([[HERO, 56]]),
    })

    const [s] = classifyHand(h)
    expect(s.deltaBB).toBe(1.8)
  })

  describe('reads the context off the action in front of Hero', () => {
    const btnHero = (before: BetAction[], heroAction: BetAction) =>
      classifyHand(
        hand({
          seats: seats(1),
          actionsPreflop: [...posts(1), ...before, heroAction],
          wons: new Map(),
        })
      )[0]

    it('open-jam: unopened, and all-in', () => {
      const s = btnHero(
        [fold(p(1).mp), fold(p(1).mp1), fold(p(1).co)],
        raise(HERO, 2000, true)
      )
      expect(s.context).toBe('unopened')
      expect(s.action).toBe('raise')
      expect(s.allIn).toBe(true)
      expect(s.heroStackBB).toBe(100)
    })

    it('iso-raise: limps in front, so the pot is limped rather than unopened', () => {
      const s = btnHero([fold(p(1).mp), call(p(1).mp1, BB), fold(p(1).co)], raise(HERO, 80))
      expect(s.context).toBe('limped')
      expect(s.action).toBe('raise')
      expect(s.openerBucket).toBeNull() // nobody has raised, so there is no opener to face
    })

    it('3-bet: one raise, nobody behind it', () => {
      const s = btnHero([raise(p(1).mp, 50), fold(p(1).mp1), fold(p(1).co)], raise(HERO, 150))
      expect(s.context).toBe('raised')
      expect(s.action).toBe('raise')
      expect(s.openerBucket).toBe('mp') // seat 4, offset −3
    })

    it('squeeze: a raise *and* a caller, which is a different decision from a 3-bet', () => {
      const s = btnHero([raise(p(1).mp, 50), call(p(1).mp1, 50), fold(p(1).co)], raise(HERO, 200))
      expect(s.context).toBe('raisedCalled')
      expect(s.action).toBe('raise')
    })

    it('4-bet: two raises in front', () => {
      const s = btnHero([raise(p(1).mp, 50), raise(p(1).co, 150), fold(p(1).mp1)], raise(HERO, 450))
      expect(s.context).toBe('threeBet')
      expect(s.action).toBe('raise')
    })
  })

  describe('hands where Hero never got a decision', () => {
    it('drops a walk in the big blind', () => {
      // Hero wins the blinds and antes without acting. Real money, but no choice was made,
      // and letting it into the BB bucket would flatter every defence stat in the chart.
      const h = hand({
        seats: seats(3),
        actionsPreflop: [
          ...posts(3),
          fold(p(3).mp), fold(p(3).mp1), fold(p(3).co), fold(p(3).btn), fold(p(3).sb),
        ],
        wons: new Map([[HERO, 42]]),
      })
      expect(classifyHand(h)).toEqual([])
    })

    it('drops a big blind that was all-in before the cards were dealt', () => {
      // A stack of exactly ante + blind: the posts consume it, so Hero is all-in without
      // ever choosing anything. Whatever this hand pays, no decision of Hero's earned it.
      const h = hand({
        seats: seats(3, ANTE + BB),
        actionsPreflop: [
          ...posts(3, true),
          fold(p(3).mp), fold(p(3).mp1), fold(p(3).co),
          raise(p(3).btn, 50),
          fold(p(3).sb),
        ],
        wons: new Map([[p(3).btn, 92]]),
      })
      expect(classifyHand(h)).toEqual([])
    })

    it('drops a hand Hero is not seated in', () => {
      const h = hand({ seats: seats(0), actionsPreflop: [] })
      expect(classifyHand(h)).toEqual([])
    })
  })

  it('keeps the big blind check in a limped pot, which *is* a decision', () => {
    const h = hand({
      seats: seats(3),
      actionsPreflop: [
        ...posts(3),
        fold(p(3).mp), call(p(3).mp1, BB), fold(p(3).co), fold(p(3).btn), fold(p(3).sb),
        check(HERO),
      ],
      wons: new Map([[p(3).mp1, 62]]),
    })
    const [s] = classifyHand(h)
    expect(s.context).toBe('limped')
    expect(s.action).toBe('check')
  })
})

describe('a preflop `bet`, which this walk cannot read', () => {
  // GG moves preflop money as blind/call/raise and never writes `bets` there, so this is
  // unreachable today. It is pinned anyway, because the failure is silent by construction:
  // `bet` carries an increment where `raise` carries a *to* total, so guessing would desync
  // Hero's commitment and put a nonzero Δ on every later node — folds included, which is
  // the identity the whole metric rests on.
  const withPreflopBet = () =>
    hand({
      seats: seats(1),
      actionsPreflop: [
        ...posts(1),
        fold(p(1).mp), fold(p(1).mp1), fold(p(1).co),
        bet(HERO, 50), // not a thing GG writes
      ],
      wons: new Map([[HERO, 42]]),
    })

  it('drops the hand rather than scoring it wrong', () => {
    expect(classifyHand(withPreflopBet())).toEqual([])
  })

  it('counts the drop, so a truncated corpus cannot pass for a complete one', async () => {
    const good = hand({
      seats: seats(1),
      actionsPreflop: [
        ...posts(1),
        fold(p(1).mp), fold(p(1).mp1), fold(p(1).co),
        raise(HERO, 50),
      ],
      wons: new Map([[HERO, 42]]),
    })

    const { situations, droppedHands } = await classifyHandHistories([
      good,
      withPreflopBet(),
      good,
    ])

    expect(situations).toHaveLength(2)
    expect(droppedHands).toBe(1)
  })

  it('does not count a hand that merely gave Hero no decision', async () => {
    // A walk yields no situations either, but nothing was refused — only a refusal counts,
    // or the caption would cry wolf on every ordinary session.
    const walk = hand({
      seats: seats(3),
      actionsPreflop: [
        ...posts(3),
        fold(p(3).mp), fold(p(3).mp1), fold(p(3).co), fold(p(3).btn), fold(p(3).sb),
      ],
      wons: new Map([[HERO, 42]]),
    })

    const { situations, droppedHands } = await classifyHandHistories([walk])
    expect(situations).toEqual([])
    expect(droppedHands).toBe(0)
  })
})

describe('toOpenerBucket', () => {
  // The collapse that keeps the samples alive. Splitting a 3-bet by the opener's exact seat
  // sixfolds the buckets and empties them; four is enough to tell an early open from a steal.
  it.each([
    [-5, 'ep'],
    [-4, 'ep'],
    [-3, 'mp'],
    [-2, 'mp'],
    [-1, 'lp'],
    [0, 'lp'],
    [1, 'blinds'],
    [2, 'blinds'],
  ] as const)('offset %i → %s', (offset, bucket) => {
    expect(toOpenerBucket(offset)).toBe(bucket)
  })
})
