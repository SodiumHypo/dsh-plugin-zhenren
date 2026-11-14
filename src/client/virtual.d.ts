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

/**
 * Virtual module filled in by the client build (D21/D25): the renamed OFL
 * derivative `ZhenrenInline` as a data URL. Its cmap is PUA-only, so the client
 * gates it with `unicode-range: U+E000-F8FF`.
 */
declare module 'virtual:zhenren-inline-font' {
  /** `data:font/woff2;base64,...` for `data/fonts/zhenren-inline.woff2`. */
  export const ZHENREN_INLINE_FONT_URL: string
}

/**
 * Virtual module filled in by the client build (D23): the compact glyph dataset
 * `data/client-glyphs.json`, keyed by `glyphChar`. The record shape lives in
 * `glyph-data.ts` so the declaration, the stub, and consumers share one type.
 */
declare module 'virtual:client-glyphs' {
  export const CLIENT_GLYPHS: Record<string, import('./glyph-data').ClientGlyph>
}

/**
 * Package version baked in by tsdown `define` (D24). The update check compares
 * it against the registry's `dist-tags.latest`; it is never read at runtime.
 */
declare const __ZHENREN_VERSION__: string
