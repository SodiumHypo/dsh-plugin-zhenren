/**
 * Test stand-in for the build-time `virtual:client-glyphs` module (D23).
 * Vitest aliases the virtual id here; the real bundle embeds the dataset.
 * An empty map keeps unit tests off the real corpus: pure logic (e.g. the
 * daily-glyph cycle) takes its corpus as an argument and injects fixtures.
 */
export const CLIENT_GLYPHS: Record<string, import('./glyph-data').ClientGlyph> = {}