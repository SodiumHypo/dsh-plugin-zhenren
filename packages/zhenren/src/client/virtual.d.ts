/**
 * Virtual module filled in by the client build: the oracle font as a data URL.
 * Declared here so `tsc` can typecheck the browser half without a generated file.
 */
declare module 'virtual:orac-font' {
  /** `data:font/woff2;base64,...` for `data/fonts/orac.woff2`. */
  export const ORAC_FONT_URL: string
}

/**
 * Virtual module filled in by the client build (D17): the curated HUST-OBC
 * image glyphs as data URLs, keyed by `glyphChar`. Declared here so `tsc` can
 * typecheck the browser half without a generated file.
 */
declare module 'virtual:glyph-images' {
  /** `glyphChar` → `data:image/png;base64,...` for `data/glyphs/<hex>.png`. */
  export const GLYPH_IMAGES: Record<string, string>
}
