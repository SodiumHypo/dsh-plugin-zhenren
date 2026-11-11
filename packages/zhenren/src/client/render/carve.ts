/**
 * Carved-glyph rendering (CLAUDE.md §5.5).
 *
 * A glyph is revealed by an irregular staircase clip, top to bottom — the
 * order is visual only and does not claim to be stroke order. A missing
 * character renders as a shallow 空刻 pit, never as a synthesised glyph.
 *
 * The glyph shape itself comes from a {@link GlyphSource} (D17): an Oracular
 * codepoint or a tinted HUST-OBC image. Both share this mask, ink and pressure.
 */
import { createRng } from '../../shared/rng.js'
import { stampGlyph, type GlyphSource } from './glyph-source.js'

const CARVE_INK = 'rgba(38, 28, 20, 0.92)'
const CARVE_EDGE = 'rgba(250, 242, 226, 0.35)'
const GHOST_INK = 'rgba(74, 58, 40, 0.16)'
const PLACEHOLDER_INK = 'rgba(96, 78, 56, 0.28)'

export interface CarvedGlyphInput {
  /** Font codepoint or HUST-OBC image to carve. */
  source: GlyphSource
  /** Centre in device pixels. */
  x: number
  y: number
  /** Glyph box in device pixels. */
  size: number
  /** Reveal, 0..1. */
  progress: number
  /** 0.55..1; deeper pressure is darker and wider. */
  pressure: number
  maskSeed: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Build a jagged top-to-bottom reveal polygon. */
function revealClip(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  size: number,
  progress: number,
  maskSeed: number,
): void {
  const rng = createRng(`carve-mask:${maskSeed}`)
  const columns = 9
  const band = size / columns
  const revealHeight = size * clamp(progress, 0, 1)
  ctx.beginPath()
  ctx.moveTo(left - band * 0.2, top - band * 0.4)
  ctx.lineTo(left + size + band * 0.2, top - band * 0.4)
  // Right edge down to the reveal frontier.
  ctx.lineTo(left + size + band * 0.2, top + revealHeight)
  // Frontier marches right-to-left with a per-column notch.
  for (let index = columns; index >= 0; index--) {
    const notch = rng.range(0.45, 1.35)
    const y = Math.min(top + size, top + revealHeight * notch)
    ctx.lineTo(left + index * band, y)
  }
  ctx.lineTo(left - band * 0.2, top - band * 0.4)
  ctx.closePath()
}

/**
 * A faint guide cut for a slot that has not been carved yet.
 *
 * Without it the shell looks blank for the first second and the carving reads
 * as "nothing happened". The dark incision then fills the guide in slot by
 * slot; this is a layout affordance, not a claim about stroke order.
 */
export function drawGlyphGhost(
  ctx: CanvasRenderingContext2D,
  input: { source: GlyphSource; x: number; y: number; size: number },
): void {
  if (input.source.char === '') return
  ctx.save()
  stampGlyph(ctx, input.source, input.x, input.y, input.size, GHOST_INK)
  ctx.restore()
}

/** A real glyph, revealed by the chisel mask. */
export function drawCarvedGlyph(ctx: CanvasRenderingContext2D, input: CarvedGlyphInput): void {
  if (input.progress <= 0 || input.source.char === '') return
  const size = input.size
  const left = input.x - size / 2
  const top = input.y - size / 2

  ctx.save()
  revealClip(ctx, left, top, size, input.progress, input.maskSeed)
  ctx.clip()

  // Chisel highlight: a faint light edge under the incision.
  stampGlyph(ctx, input.source, input.x + size * 0.012, input.y + size * 0.012, size, CARVE_EDGE)

  const strength = clamp(0.55 + input.pressure * 0.45, 0.55, 1)
  ctx.globalAlpha = strength
  stampGlyph(ctx, input.source, input.x, input.y, size, CARVE_INK)
  ctx.globalAlpha = 1
  ctx.restore()
}

/**
 * 空刻: a shallow pit with a few tool marks.
 * Not a glyph, not a blank — the slot visibly holds an absence.
 */
export function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  progress: number,
  maskSeed: number,
): void {
  if (progress <= 0) return
  const rng = createRng(`placeholder:${maskSeed}`)
  const reveal = clamp(progress, 0, 1)
  const width = size * 0.5
  const height = size * 0.42

  ctx.save()
  ctx.strokeStyle = PLACEHOLDER_INK
  ctx.lineWidth = Math.max(0.8, size * 0.022)
  ctx.lineCap = 'round'
  const marks = 5
  for (let index = 0; index < marks; index++) {
    const row = index / marks
    if (row > reveal) break
    const fromX = x - width / 2 + rng.range(0, width * 0.2)
    const toX = x + width / 2 - rng.range(0, width * 0.2)
    const lineY = y - height / 2 + height * row + rng.range(-1, 1) * size * 0.02
    ctx.beginPath()
    ctx.moveTo(fromX, lineY)
    ctx.lineTo(toX, lineY + rng.range(-1, 1) * size * 0.03)
    ctx.stroke()
  }
  ctx.restore()
}
