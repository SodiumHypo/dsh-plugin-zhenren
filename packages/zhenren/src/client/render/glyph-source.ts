/**
 * GlyphSource abstraction (D17, CLAUDE.md §5.1).
 *
 * A carved slot is drawn from one of two sources:
 *   - `font`  — `fillText` of an Oracular codepoint;
 *   - `image` — a curated HUST-OBC PNG, tinted to the chisel ink.
 *
 * Both branches stamp the same shape into the current `fillStyle`/`globalAlpha`,
 * so the ghost guide, the chisel highlight, the pressure-weighted incision and
 * the staircase reveal mask are shared verbatim. The image is normalised at build
 * time to black-on-transparent; tinting recolours it without a "rubbing sticker"
 * look. Tinted canvases are cached per (glyph, ink) — a static asset cache like
 * the decoded images, not a per-frame scratch surface.
 */
import { getGlyphImage } from '../glyph-images.js'

/** Rendering branch of one carved slot. */
export type GlyphSource =
  | { kind: 'font'; char: string; fontFamily: string }
  | { kind: 'image'; char: string }

const tintCache = new Map<string, HTMLCanvasElement>()

/** Recolour a decoded glyph to `fillStyle`, preserving its alpha, once per ink. */
function tinted(char: string, image: HTMLImageElement, fillStyle: string): HTMLCanvasElement | undefined {
  const key = `${char}|${fillStyle}`
  const cached = tintCache.get(key)
  if (cached !== undefined) return cached
  if (typeof document === 'undefined') return undefined
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (width === 0 || height === 0) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) return undefined
  ctx.drawImage(image, 0, 0)
  // source-in keeps the glyph alpha and replaces its colour with the ink.
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = fillStyle
  ctx.fillRect(0, 0, width, height)
  tintCache.set(key, canvas)
  return canvas
}

/**
 * Stamp a glyph centred at (`x`, `y`) in a `size` box using `fillStyle` and the
 * context's current `globalAlpha`.
 * @returns `false` when an image glyph has no decoded asset; the caller then
 * leaves the slot to the text layer rather than drawing tofu.
 */
export function stampGlyph(
  ctx: CanvasRenderingContext2D,
  source: GlyphSource,
  x: number,
  y: number,
  size: number,
  fillStyle: string,
): boolean {
  if (source.kind === 'font') {
    ctx.font = `${size}px "${source.fontFamily}"`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = fillStyle
    ctx.fillText(source.char, x, y)
    return true
  }
  const image = getGlyphImage(source.char)
  if (image === undefined) return false
  const canvas = tinted(source.char, image, fillStyle)
  if (canvas === undefined) return false
  ctx.drawImage(canvas, x - size / 2, y - size / 2, size, size)
  return true
}