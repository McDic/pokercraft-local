/**
 * Hand Usage Heatmaps Chart
 * Shows VPIP (Voluntarily Put In Pot) by hand and position
 */

import type { Data, Layout } from 'plotly.js-dist-min'
import type { HandHistory } from '../../types'
import {
  getHandHistoryOffsetFromButton,
  getHandHistoryPreflopPassiveFolded,
} from '../../types'
import type { Translate, TranslationKey } from '../../i18n'
import { yieldToBrowser } from '../../utils'

export interface HandUsageHeatmapsData {
  traces: Data[]
  layout: Partial<Layout>
}

// Card number order (2 lowest, A highest)
const CARD_NUMBERS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']

// O(1) lookup map instead of indexOf
const CARD_NUMBER_INDEX = new Map<string, number>(
  CARD_NUMBERS.map((c, i) => [c, i])
)

interface MatrixCell {
  prefold: number
  totalDealt: number
}

type HandMatrix = MatrixCell[][]

/**
 * Parse a card string to get just the number part
 */
function getCardNumber(card: string): string {
  return card[0]
}

/**
 * Get 2D index for a hand in the matrix
 * Suited hands are above diagonal, offsuit below, pairs on diagonal
 */
function getIdx2d(card1: string, card2: string): [number, number] {
  const num1 = getCardNumber(card1)
  const num2 = getCardNumber(card2)
  const shape1 = card1[1]
  const shape2 = card2[1]

  const isSuited = shape1 === shape2
  const idx1 = CARD_NUMBER_INDEX.get(num1) ?? 0
  const idx2 = CARD_NUMBER_INDEX.get(num2) ?? 0

  // Ensure big card is first
  const bigIdx = Math.min(idx1, idx2)
  const smallIdx = Math.max(idx1, idx2)

  if (isSuited) {
    // Suited: row = big card, col = small card
    return [bigIdx, smallIdx]
  } else {
    // Offsuit: row = small card, col = big card
    return [smallIdx, bigIdx]
  }
}

/**
 * Get hand category from matrix index
 */
function getHandCategory(row: number, col: number): 'suited' | 'offsuit' | 'pocket' {
  if (row === col) return 'pocket'
  return row < col ? 'suited' : 'offsuit'
}

/**
 * Convert matrix index to hand string
 */
function idx2dToString(row: number, col: number): string {
  const num1 = CARD_NUMBERS[row]
  const num2 = CARD_NUMBERS[col]
  const category = getHandCategory(row, col)

  switch (category) {
    case 'pocket':
      return `${num1}${num2}`
    case 'suited':
      return `${num1}${num2}s`
    case 'offsuit':
      return `${num2}${num1}o`
  }
}

/**
 * Create empty matrix
 */
function createEmptyMatrix(): HandMatrix {
  return Array.from({ length: 13 }, () =>
    Array.from({ length: 13 }, () => ({ prefold: 0, totalDealt: 0 }))
  )
}

/**
 * Calculate VPIP from a cell
 */
function calcVPIP(cell: MatrixCell): number {
  if (cell.totalDealt === 0) return NaN
  return 1 - cell.prefold / cell.totalDealt
}

/**
 * Aggregate VPIP across a matrix
 */
function aggregateVPIP(matrix: HandMatrix): number {
  let prefoldTotal = 0
  let totalDealt = 0
  for (const row of matrix) {
    for (const cell of row) {
      prefoldTotal += cell.prefold
      totalDealt += cell.totalDealt
    }
  }
  return totalDealt > 0 ? 1 - prefoldTotal / totalDealt : NaN
}

/**
 * Calculate range usage percentage
 */
function getRangeUsage(matrix: HandMatrix, minVPIP = 0): number {
  let totalWeight = 0
  let rangeWeight = 0

  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const category = getHandCategory(row, col)
      const weight = category === 'pocket' ? 6 : category === 'suited' ? 4 : 12

      if (calcVPIP(matrix[row][col]) > minVPIP) {
        rangeWeight += weight
      }
      totalWeight += weight
    }
  }

  return rangeWeight / totalWeight
}

/**
 * Generate hand usage heatmaps chart data (async for large datasets)
 */
export async function getHandUsageHeatmapsData(
  handHistories: HandHistory[],
  t: Translate
): Promise<HandUsageHeatmapsData> {
  // Create matrices for each position
  const matrices: Map<number | null, HandMatrix> = new Map([
    [-5, createEmptyMatrix()], // UTG
    [-4, createEmptyMatrix()], // UTG+1
    [-3, createEmptyMatrix()], // MP
    [-2, createEmptyMatrix()], // MP+1
    [-1, createEmptyMatrix()], // CO
    [0, createEmptyMatrix()],  // BTN
    [1, createEmptyMatrix()],  // SB
    [2, createEmptyMatrix()],  // BB
    [null, createEmptyMatrix()], // All positions
  ])

  // Process hand histories
  for (let i = 0; i < handHistories.length; i++) {
    const hh = handHistories[i]
    const heroCards = hh.knownCards.get('Hero')
    if (!heroCards) continue

    let offset: number
    try {
      offset = getHandHistoryOffsetFromButton(hh, 'Hero')
    } catch {
      continue
    }

    // Map offset to available positions (UTG and earlier map to -5)
    const mappedOffset = offset <= -5 ? -5 : offset

    const matrix = matrices.get(mappedOffset)
    const allMatrix = matrices.get(null)
    if (!matrix || !allMatrix) continue

    const [card1, card2] = heroCards
    const [row, col] = getIdx2d(card1, card2)
    const prefolded = getHandHistoryPreflopPassiveFolded(hh, 'Hero')

    if (prefolded !== null) {
      matrix[row][col].totalDealt++
      allMatrix[row][col].totalDealt++
      if (prefolded) {
        matrix[row][col].prefold++
        allMatrix[row][col].prefold++
      }
    }

    // Yield every 1000 hands to keep UI responsive
    if ((i + 1) % 1000 === 0) {
      await yieldToBrowser()
    }
  }

  // Generate text labels for all cells
  const texts: string[][] = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => idx2dToString(row, col))
  )

  const traces: Data[] = []

  // Position configurations (row, col, offset, translation key)
  const positions: [number, number, number | null, TranslationKey][] = [
    [1, 1, -5, 'chart.handUsage.position.utg'],
    [1, 2, -4, 'chart.handUsage.position.utg1'],
    [1, 3, -3, 'chart.handUsage.position.mp'],
    [2, 1, -2, 'chart.handUsage.position.mp1'],
    [2, 2, -1, 'chart.handUsage.position.co'],
    [2, 3, 0, 'chart.handUsage.position.btn'],
    [3, 1, 1, 'chart.handUsage.position.sb'],
    [3, 2, 2, 'chart.handUsage.position.bb'],
    [3, 3, null, 'chart.handUsage.position.all'],
  ]

  /** The label under each heatmap, e.g. "BTN (VPIP 42.1%, Range 30.0%)". */
  const subplotTitle = (posKey: TranslationKey, matrix: HandMatrix): string =>
    t('chart.handUsage.subplotTitle', {
      position: t(posKey),
      vpip: (aggregateVPIP(matrix) * 100).toFixed(1),
      range: (getRangeUsage(matrix, 0.1) * 100).toFixed(1),
    })

  for (const [figRow, figCol, offset, posKey] of positions) {
    const matrix = matrices.get(offset)!

    const z = matrix.map(row => row.map(cell => calcVPIP(cell)))
    const title = subplotTitle(posKey, matrix)

    traces.push({
      type: 'heatmap',
      z: z,
      text: texts as unknown as string[],
      texttemplate: '%{text}',
      showscale: false,
      colorscale: 'YlGnBu',
      zmin: 0,
      zmax: 1,
      hovertemplate: t('chart.handUsage.hover.vpip'),
      xaxis: `x${(figRow - 1) * 3 + figCol}`,
      yaxis: `y${(figRow - 1) * 3 + figCol}`,
      name: title,
    } as Data)
  }

  // Build layout with 3x3 grid
  const layout: Partial<Layout> = {
    title: { text: t('chart.handUsage.title') },
    height: 900,
    showlegend: false,
    grid: {
      rows: 3,
      columns: 3,
      pattern: 'independent',
    },
  }

  // Add individual subplot configurations
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col + 1
      const xDomain = [col / 3 + 0.02, (col + 1) / 3 - 0.02]
      const yDomain = [1 - (row + 1) / 3 + 0.05, 1 - row / 3 - 0.05]

      const posConfig = positions[row * 3 + col]
      const axisTitle = subplotTitle(posConfig[3], matrices.get(posConfig[2])!)

      ;(layout as Record<string, unknown>)[`xaxis${idx === 1 ? '' : idx}`] = {
        domain: xDomain,
        showticklabels: false,
        showgrid: false,
        zeroline: false,
        title: { text: axisTitle, font: { size: 11 } },
      }
      ;(layout as Record<string, unknown>)[`yaxis${idx === 1 ? '' : idx}`] = {
        domain: yDomain,
        showticklabels: false,
        showgrid: false,
        zeroline: false,
        autorange: 'reversed',
      }
    }
  }

  return { traces, layout }
}
