/**
 * Test stand-in for the build-time `virtual:glyph-images` module (D17).
 * Vitest aliases the virtual id here; the real bundle embeds the PNG bytes.
 * An empty map means tests exercise the font branch and the image-missing
 * fallback, never a real decode.
 */
export const GLYPH_IMAGES: Record<string, string> = {}