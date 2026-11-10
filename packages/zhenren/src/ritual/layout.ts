/**
 * Inscription layout (CLAUDE.md §5.5).
 *
 * Vertical columns, right to left, top to bottom within a column. Coordinates
 * are normalized to the shell; the client scales them to its canvas.
 *
 * Missing characters keep their slot. A 空刻 is a real position, not a gap in
 * the layout: the reader sees that something is absent.
 */
import type { Rect } from '../contract.js'

export const MAX_COLUMNS = 4
export const MAX_ROWS = 12
/** Hard upper bound on carvable slots; mirrors `maxInscriptionChars`. */
export const MAX_SLOTS = MAX_COLUMNS * MAX_ROWS

export interface LayoutSlot {
  index: number
  column: number
  row: number
  x: number
  y: number
  /** Nominal glyph box size in normalized units. */
  size: number
}

export interface RitualLayout {
  columns: number
  rows: number
  direction: 'rtl'
  slots: LayoutSlot[]
}

export interface LayoutInput {
  /** Number of slots to place. */
  count: number
  /** Suggested column count; clamped to what the count allows. */
  requestedColumns?: number | undefined
  bounds: Rect
  /** Used to shift the text block away from the heated spot. */
  burnPoint?: { x: number; y: number } | undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Place `count` slots on the shell.
 * @returns `null` when the count cannot be laid out; the tool turns that into
 *          `ok: false` and tells the model to shorten the inscription.
 */
export function computeLayout(input: LayoutInput): RitualLayout | null {
  const { count, bounds } = input
  if (count <= 0 || count > MAX_SLOTS) return null

  const requested = input.requestedColumns ?? Math.ceil(count / MAX_ROWS)
  const columns = clamp(Math.round(requested), 1, Math.min(MAX_COLUMNS, count))
  const rows = Math.ceil(count / columns)
  if (rows > MAX_ROWS) return null

  const areaW = bounds.w * 0.8
  const areaH = bounds.h * 0.8
  // Keep the block off the burn point's half of the shell when possible.
  const shift = input.burnPoint === undefined ? 0 : input.burnPoint.x > 0.5 ? -0.04 : 0.04
  const areaX = clamp(bounds.x + bounds.w * 0.1 + shift, bounds.x, bounds.x + bounds.w - areaW)
  const areaY = bounds.y + bounds.h * 0.1
  const cellW = areaW / columns
  const cellH = areaH / rows
  const size = Math.min(cellW, cellH) * 0.8

  const slots: LayoutSlot[] = []
  for (let index = 0; index < count; index++) {
    const column = Math.floor(index / rows)
    const row = index % rows
    slots.push({
      index,
      column,
      row,
      x: round(areaX + areaW - (column + 0.5) * cellW, 4),
      y: round(areaY + (row + 0.5) * cellH, 4),
      size: round(size, 4),
    })
  }

  return { columns, rows, direction: 'rtl', slots }
}

/** Human-readable summary returned to the model. */
export function describeLayout(layout: RitualLayout): string {
  return `${layout.columns} columns, right-to-left`
}
