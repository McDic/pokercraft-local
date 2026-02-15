/**
 * Hand History Parser
 * Parses GG Poker hand history files
 */

import type { HandHistory, BetAction, HandStage, CardString } from '../types'

// Regex patterns for hand history files
const LINE1_INTRO = /^Poker Hand #(TM|BR|SG)(\d+): Tournament #(\d+), (.+) - Level(\d+)\(([\d,]+)\/([\d,]+)\) - (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})$/
const LINE2_TABLE_NUM = /^Table '(\d+)' (\d+)-max Seat #(\d+) is the button$/
const LINE3_SEAT_INFO = /^Seat (\d+): ([0-9a-f]+|Hero) \(([\d,]+) in chips\)$/
const LINE4_POSTS_DEAD_MONEY = /^([0-9a-f]+|Hero): posts (?:the )?(ante|big blind|small blind) ([\d,]+)$/
const LINE5_HOLE_CARDS = '*** HOLE CARDS ***'
const LINE5_DEALT_TO = /^Dealt to ([0-9a-f]+|Hero)( \[[2-9AKQJT][sdch] [2-9AKQJT][sdch]\])?$/

const LINE6_HEADER_FLOP = /^\*\*\* FLOP \*\*\* \[((?:[2-9AKQJT][sdch] ?){3})\]$/
const LINE6_HEADER_TURN = /^\*\*\* TURN \*\*\* \[((?:[2-9AKQJT][sdch] ?){3})\] \[([2-9AKQJT][sdch])\]$/
const LINE6_HEADER_RIVER = /^\*\*\* RIVER \*\*\* \[((?:[2-9AKQJT][sdch] ?){4})\] \[([2-9AKQJT][sdch])\]$/
const LINE6_BETTING_ACTION = /^([0-9a-f]+|Hero): (folds|checks|calls ([\d,]+)|raises ([\d,]+) to ([\d,]+)|bets ([\d,]+))( and is all-in)?$/
const LINE6_RETURNED_UNCALLED_BET = /^Uncalled bet \(([\d,]+)\) returned to ([0-9a-f]+|Hero)$/
const LINE6_SHOWS = /^([0-9a-f]+|Hero): shows \[([2-9AKQJT][sdch]( [2-9AKQJT][sdch])?)\]/

const LINE7_HEADER_SHOWDOWN = '*** SHOWDOWN ***'
const LINE7_COLLECTED = /^([0-9a-f]+|Hero) collected ([\d,]+) from pot$/

const LINE8_HEADER_SUMMARY = '*** SUMMARY ***'
const LINE8_POT = /^Total pot ([\d,]+) \| Rake ([\d,]+)/
const LINE8_BOARD = /^Board \[((?:[2-9AKQJT][sdch] ?){3,5})\]$/
const LINE8_INFO_BY_SEAT = /^Seat (\d+): ([0-9a-f]+|Hero)/

// Filename pattern for hand history files (excluding Short Deck and Omaha)
export const HAND_HISTORY_FILENAME_PATTERN = /^GG\d{8}-\d{4} - ((?!(Short Deck|Omaha)).)*\.txt$/

type ParsingStage = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

/**
 * Check if a filename matches hand history pattern
 */
export function isHandHistoryFile(filename: string): boolean {
  return HAND_HISTORY_FILENAME_PATTERN.test(filename)
}

/**
 * Parse an integer from a string, removing commas
 */
function parseIntWithCommas(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10)
}

/**
 * Parse datetime from hand history format
 */
function parseDatetime(dtStr: string): Date {
  const [dateStr, timeStr] = dtStr.split(' ')
  const [year, month, day] = dateStr.split('/').map(Number)
  const [hour, minute, second] = timeStr.split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute, second)
}

/**
 * Create a new empty HandHistory object
 */
function createEmptyHandHistory(
  id: string,
  tournamentId: number,
  tournamentName: string,
  level: number,
  sb: number,
  bb: number,
  datetime: Date
): HandHistory {
  return {
    id,
    tournamentId,
    tournamentName,
    level,
    sb,
    bb,
    datetime,
    buttonSeat: -1,
    sbSeat: null,
    bbSeat: -1,
    maxSeats: 999,
    seats: new Map(),
    knownCards: new Map(),
    wons: new Map(),
    communityCards: [],
    actionsPreflop: [],
    actionsFlop: [],
    actionsTurn: [],
    actionsRiver: [],
    uncalledReturned: null,
    allIned: new Map(),
  }
}

/**
 * Post-process hand history to fix ante/blind all-in detection
 */
function postprocessHandHistory(h: HandHistory): HandHistory {
  // Find max ante
  let maxAnte = 0
  for (const action of h.actionsPreflop) {
    if (action.action === 'ante' && action.amount > maxAnte) {
      maxAnte = action.amount
    }
  }

  // Fix ante all-in
  for (let i = 0; i < h.actionsPreflop.length; i++) {
    const action = h.actionsPreflop[i]
    if (action.action === 'ante' && action.amount < maxAnte && !action.isAllIn) {
      h.actionsPreflop[i] = { ...action, isAllIn: true }
    }
  }

  // Fix SB/BB all-in
  for (let i = 0; i < h.actionsPreflop.length; i++) {
    const action = h.actionsPreflop[i]
    if (action.action === 'blind') {
      // Find player's seat
      let playerSeat: number | null = null
      for (const [seat, [playerId]] of h.seats) {
        if (playerId === action.playerId) {
          playerSeat = seat
          break
        }
      }

      if (playerSeat !== null) {
        const isSBShort = h.sbSeat !== null && playerSeat === h.sbSeat && h.sb > action.amount
        const isBBShort = playerSeat === h.bbSeat && h.bb > action.amount

        if ((isSBShort || isBBShort) && !action.isAllIn) {
          h.actionsPreflop[i] = { ...action, isAllIn: true }
        }
      }
    }
  }

  return h
}

/**
 * Get seat number for a player
 */
function getSeatNumber(h: HandHistory, playerId: string): number {
  for (const [seat, [pid]] of h.seats) {
    if (pid === playerId) {
      return seat
    }
  }
  throw new Error(`Player ${playerId} not found in seats`)
}

/**
 * Parse a single hand history file content
 * Returns an array of HandHistory objects (a file can contain multiple hands)
 */
export function parseHandHistory(content: string): HandHistory[] {
  const results: HandHistory[] = []
  let currentHand: HandHistory | null = null
  let currentStage: ParsingStage = 'preflop'
  let continuousNewlineCount = 0

  const lines = content.split('\n')

  for (let lineno = 0; lineno < lines.length; lineno++) {
    const line = lines[lineno].trim()

    if (!line) {
      continuousNewlineCount++
      if (continuousNewlineCount >= 3 && currentHand) {
        // End of current hand without proper summary
        break
      }
      continue
    }
    continuousNewlineCount = 0

    let match: RegExpMatchArray | null

    // LINE1: Hand intro
    if ((match = LINE1_INTRO.exec(line))) {
      const [, , handIdStr, tournamentIdStr, tournamentName, levelStr, sbStr, bbStr, dtStr] = match
      const handId = parseInt(handIdStr, 10)
      const tournamentId = parseInt(tournamentIdStr, 10)
      const level = parseInt(levelStr, 10)
      const sb = parseIntWithCommas(sbStr)
      const bb = parseIntWithCommas(bbStr)
      const dt = parseDatetime(dtStr)

      currentHand = createEmptyHandHistory(
        `TM${handId}`,
        tournamentId,
        tournamentName,
        level,
        sb,
        bb,
        dt
      )
      currentStage = 'preflop'
    }

    // LINE2: Table info
    else if ((match = LINE2_TABLE_NUM.exec(line))) {
      if (!currentHand || currentStage !== 'preflop') continue
      const [, , maxSeatsStr, buttonSeatStr] = match
      currentHand.maxSeats = parseInt(maxSeatsStr, 10)
      currentHand.buttonSeat = parseInt(buttonSeatStr, 10)
    }

    // LINE3: Seat info
    else if ((match = LINE3_SEAT_INFO.exec(line))) {
      if (!currentHand || currentStage !== 'preflop') continue
      const [, seatNumStr, playerId, chipsStr] = match
      const seatNum = parseInt(seatNumStr, 10)
      const chips = parseIntWithCommas(chipsStr)
      currentHand.seats.set(seatNum, [playerId, chips])
    }

    // LINE4: Posts (ante/blinds)
    else if ((match = LINE4_POSTS_DEAD_MONEY.exec(line))) {
      if (!currentHand || currentStage !== 'preflop') continue
      const [, playerId, postType, amountStr] = match
      const amount = parseIntWithCommas(amountStr)
      const action: BetAction = {
        playerId,
        action: postType === 'ante' ? 'ante' : 'blind',
        amount,
        isAllIn: false,
      }
      currentHand.actionsPreflop.push(action)

      if (postType === 'small blind') {
        currentHand.sbSeat = getSeatNumber(currentHand, playerId)
      } else if (postType === 'big blind') {
        currentHand.bbSeat = getSeatNumber(currentHand, playerId)
      }
    }

    // LINE5: Hole cards header
    else if (line === LINE5_HOLE_CARDS) {
      // Just a marker, do nothing
    }

    // LINE5: Dealt to player
    else if ((match = LINE5_DEALT_TO.exec(line))) {
      if (!currentHand || currentStage !== 'preflop') continue
      const playerId = match[1]
      const cardsGroup = match[2]
      if (cardsGroup) {
        const cardsStr = cardsGroup.trim().slice(1, -1) // Remove [ ]
        const cards = cardsStr.split(' ') as [CardString, CardString]
        if (cards.length === 2) {
          currentHand.knownCards.set(playerId, cards)
        }
      }
    }

    // LINE6: Flop header
    else if ((match = LINE6_HEADER_FLOP.exec(line))) {
      if (!currentHand || currentStage !== 'preflop') continue
      const cardsStr = match[1]
      const cards = cardsStr.split(' ').filter(c => c) as CardString[]
      if (cards.length === 3) {
        currentHand.communityCards.push(...cards)
        currentStage = 'flop'
      }
    }

    // LINE6: Turn header
    else if ((match = LINE6_HEADER_TURN.exec(line))) {
      if (!currentHand || currentStage !== 'flop') continue
      const turnCard = match[2] as CardString
      currentHand.communityCards.push(turnCard)
      currentStage = 'turn'
    }

    // LINE6: River header
    else if ((match = LINE6_HEADER_RIVER.exec(line))) {
      if (!currentHand || currentStage !== 'turn') continue
      const riverCard = match[2] as CardString
      currentHand.communityCards.push(riverCard)
      currentStage = 'river'
    }

    // LINE6: Betting action
    else if ((match = LINE6_BETTING_ACTION.exec(line))) {
      if (!currentHand) continue
      if (!['preflop', 'flop', 'turn', 'river'].includes(currentStage)) continue

      const playerId = match[1]
      const actionStr = match[2]
      const isAllIn = match[7] !== undefined

      let action: BetAction

      if (actionStr.startsWith('folds')) {
        action = { playerId, action: 'fold', amount: 0, isAllIn: false }
      } else if (actionStr.startsWith('checks')) {
        action = { playerId, action: 'check', amount: 0, isAllIn: false }
      } else if (actionStr.startsWith('calls')) {
        const amount = parseIntWithCommas(match[3])
        action = { playerId, action: 'call', amount, isAllIn }
      } else if (actionStr.startsWith('bets')) {
        const amount = parseIntWithCommas(match[6])
        action = { playerId, action: 'bet', amount, isAllIn }
      } else if (actionStr.startsWith('raises')) {
        const amount = parseIntWithCommas(match[5]) // "to" amount
        action = { playerId, action: 'raise', amount, isAllIn }
      } else {
        continue // Unknown action
      }

      if (isAllIn && !currentHand.allIned.has(playerId)) {
        currentHand.allIned.set(playerId, currentStage as HandStage)
      }

      switch (currentStage) {
        case 'preflop':
          currentHand.actionsPreflop.push(action)
          break
        case 'flop':
          currentHand.actionsFlop.push(action)
          break
        case 'turn':
          currentHand.actionsTurn.push(action)
          break
        case 'river':
          currentHand.actionsRiver.push(action)
          break
      }
    }

    // LINE6: Uncalled bet returned
    else if ((match = LINE6_RETURNED_UNCALLED_BET.exec(line))) {
      if (!currentHand) continue
      const amountStr = match[1]
      const playerId = match[2]
      const amount = parseIntWithCommas(amountStr)
      currentHand.uncalledReturned = [playerId, amount]
    }

    // LINE6: Shows cards
    else if ((match = LINE6_SHOWS.exec(line))) {
      if (!currentHand) continue
      const playerId = match[1]
      const cardsStr = match[2].trim()
      const cards = cardsStr.split(' ').filter(c => c)

      if (cards.length === 2 && !currentHand.knownCards.has(playerId)) {
        currentHand.knownCards.set(playerId, cards as [CardString, CardString])
      }
    }

    // LINE7: Showdown header
    else if (line === LINE7_HEADER_SHOWDOWN) {
      if (!currentHand) continue
      currentStage = 'showdown'
    }

    // LINE7: Collected from pot
    else if ((match = LINE7_COLLECTED.exec(line))) {
      if (!currentHand || currentStage !== 'showdown') continue
      const [, playerId, amountStr] = match
      const amount = parseIntWithCommas(amountStr)
      const currentWon = currentHand.wons.get(playerId) ?? 0
      currentHand.wons.set(playerId, currentWon + amount)
    }

    // LINE8: Summary header - hand is complete
    else if (line === LINE8_HEADER_SUMMARY) {
      if (currentHand) {
        results.push(postprocessHandHistory(currentHand))
        currentHand = null
      }
    }

    // LINE8: Pot info (ignored)
    else if (LINE8_POT.test(line)) {
      // Ignored
    }

    // LINE8: Board (ignored)
    else if (LINE8_BOARD.test(line)) {
      // Ignored
    }

    // LINE8: Seat info in summary (ignored)
    else if (LINE8_INFO_BY_SEAT.test(line)) {
      // Ignored
    }

    // Unknown line - skip silently for robustness
  }

  return results
}
