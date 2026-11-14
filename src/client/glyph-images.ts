/**
 * HUST-OBC image-glyph loading (D17, CLAUDE.md §5.1).
 *
 * The curated PNGs ship inside the client bundle as data URLs (see
 * `virtual:glyph-images`). Each glyph is decoded once into an `HTMLImageElement`
 * and cached; the renderer tints the decoded image to the chisel ink so image
 * glyphs share the font glyphs' material. A glyph whose asset is absent or fails
 * to decode simply has no image — the caller falls back to text, never tofu.
 */
import { GLYPH_IMAGES } from 'virtual:glyph-images'

const imageCache = new Map<string, HTMLImageElement>()

/** Decode one data URL into a cached element; resolves `undefined` on failure. */
function decode(char: string, url: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve()
      return
    }
    const image = new Image()
    image.onload = () => {
      imageCache.set(char, image)
      resolve()
    }
    image.onerror = () => {
      resolve()
    }
    image.src = url
  })
}

/**
 * Preload the image glyphs a card needs. Idempotent and offline: characters
 * without a bundled asset are skipped, and a decode failure never rejects.
 */
export function loadGlyphImages(chars: readonly string[]): Promise<void> {
  const needed: Array<Promise<void>> = []
  for (const char of chars) {
    if (imageCache.has(char)) continue
    const url = GLYPH_IMAGES[char]
    if (url === undefined) continue
    needed.push(decode(char, url))
  }
  if (needed.length === 0) return Promise.resolve()
  return Promise.all(needed).then(() => undefined)
}

/** The decoded image for a glyph, or `undefined` if not loaded/available. */
export function getGlyphImage(char: string): HTMLImageElement | undefined {
  return imageCache.get(char)
}