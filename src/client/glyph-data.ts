/**
 * Compact client-side glyph dataset (D23).
 *
 * The daily-glyph widget and inline lookups run in the browser without a host
 * tool call, so they read `data/client-glyphs.json` (embedded by the build as
 * `virtual:client-glyphs`) instead of the host's `oracle.json`. This module is
 * the single source of truth for the record shape; the virtual declaration and
 * the test stub both reference {@link ClientGlyph}.
 *
 * Honesty boundaries are preserved verbatim from the data layer: `original` is
 * null when 《说文》 has no entry for the form, `evolution` is null while the
 * material is being compiled, and `inline` is null when a glyph cannot be
 * embedded for prose. Nothing here synthesizes a glyph or a gloss.
 */
import { CLIENT_GLYPHS } from 'virtual:client-glyphs'

/** One stage of a glyph's evolution; description only, never a fabricated image. */
export interface ClientEvolutionStage {
  name: string
  note: string
}

/** Glyph evolution text (D23); `null` upstream means 「演变资料整理中」. */
export interface ClientEvolution {
  stages: ClientEvolutionStage[]
  status: 'draft' | 'reviewed'
}

/** A single glyph record in the compact client dataset. */
export interface ClientGlyph {
  /** Rendering branch: codepoint font (Oracular) or curated PNG (HUST-OBC). */
  source: 'font' | 'image'
  /** 《说文》 headword the glyph resolves to, or null when gloss-less. */
  headword: string | null
  pinyin: string | null
  /** Verbatim 《说文》 text, or null when 《说文》 does not cover this form. */
  original: string | null
  /** Modern paraphrase (our draft text); empty string when none. */
  vernacular: string
  evolution: ClientEvolution | null
  /** Prose-inline PUA codepoint (U+E000–F8FF), or null when unsupported. */
  inline: string | null
}

/** `glyphChar` → record. Frozen at build time; read-only at runtime. */
export const GLYPH_DATA: Record<string, ClientGlyph> = CLIENT_GLYPHS