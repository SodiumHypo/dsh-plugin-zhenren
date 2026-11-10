/**
 * Data contract for `data/oracle.json` (CLAUDE.md §3.4).
 *
 * Two record layers plus one index:
 *   headwords  keyed by 说文 headword (朙 / 亾 / 㠯 ...), carries the gloss
 *   glyphs     keyed by glyphChar (one of the 1,425 oracle glyphs), points at
 *              a headword or `null`
 *   aliases    input form → glyphChar, keys disjoint from the glyph set
 *
 * Validation is hand-written on purpose: the runtime must not grow a schema
 * library for a 560 KB file it validates once per process.
 */

/** Where a piece of content came from. Audit only, never rendered as prose. */
export interface SourceRef {
  kind: 'oracleGlyph' | 'shuowen' | 'correction'
  value: string
}

/** A 古文字 correction attached to a headword, with its provenance. */
export interface CorrectionRef {
  text: string
  source: string
}

/** One 说文 entry, restricted to the fields this project ships. */
export interface ShuowenGloss {
  /** 逐字保留的《说文》原文；不删「凡……之屬皆从……」公式。 */
  original: string
  /**
   * 现代白话转述。The extraction pipeline does not synthesize these, so the
   * shipped corpus carries `''` until a human writes and reviews one.
   */
  vernacular: string
  vernacularStatus: 'draft' | 'reviewed'
  correction: CorrectionRef | null
}

/** Gloss record, keyed by 说文 headword. */
export interface HeadwordRecord {
  shuowen: ShuowenGloss
  pinyin: string | null
  radical: string | null
  /** Reverse reference, derived at build time and sorted by codepoint. */
  glyphChars: string[]
  sources: { shuowen: string }
}

/** Build-time resolution path, kept for audit (CLAUDE.md §3.4). */
export type ResolvedBy =
  | 'manual-headword'
  | 'exact-sw'
  | 'reverse-w'
  | 'opencc'
  | 'ts'
  | 'none'

/** Glyph record, keyed by glyphChar. `headword: null` means glyph-only. */
export interface GlyphRecord {
  headword: string | null
  resolvedBy: ResolvedBy
}

export interface OracleCounts {
  glyphs: number
  glossedGlyphs: number
  glyphOnly: number
  headwords: number
  sharedHeadwords: number
  aliases: number
}

/** Top-level shape of `data/oracle.json`. */
export interface OracleData {
  schemaVersion: number
  generatedAt: string
  source: { yigezi: string; shuowen: string; font: string }
  counts: OracleCounts
  headwords: Record<string, HeadwordRecord>
  glyphs: Record<string, GlyphRecord>
  aliases: Record<string, string>
}

/**
 * Result of a single-character query (CLAUDE.md §3.5).
 *
 * `found` means "this character has an oracle glyph", NOT "this character has
 * a 说文 gloss". `found: true` with `headword: null` and `shuowen: null` is a
 * valid, expected result for glyph-only characters.
 */
export type OracleLookup = OracleLookupFound | OracleLookupMissing

export interface OracleLookupFound {
  found: true
  /** Raw input as given by the caller. */
  query: string
  /** The glyphChar the query resolved to; may differ from `query`. */
  normalized: string
  glyphChar: string
  headword: string | null
  shuowen: ShuowenGloss | null
  matchedBy: 'glyph' | 'alias'
  sources: SourceRef[]
}

export interface OracleLookupMissing {
  found: false
  query: string
  /** Cleaned input. Does not imply a near-match exists. */
  normalized: string
  /** `empty-query` when normalization found no Han character at all. */
  reason: 'not-in-oracle-corpus' | 'empty-query'
  supportedCount: number
}

/** The only schemaVersion this build understands. */
export const ORACLE_SCHEMA_VERSION = 1

/** Documented corpus size; used in error text and UI footers. */
export const ORACLE_GLYPH_COUNT = 1425

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Raised when the bundled data file is missing, corrupt, or inconsistent. */
export class DataUnavailableError extends Error {
  readonly code = 'data-unavailable'
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DataUnavailableError'
  }
}

function fail(path: string, expectation: string): never {
  throw new DataUnavailableError(`${path}: ${expectation}`)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) fail(path, 'must be an object')
  return value
}

function expectString(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string') fail(path, 'must be a string')
  if (!allowEmpty && value === '') fail(path, 'must not be empty')
  return value
}

function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) return null
  return expectString(value, path)
}

function expectCount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(path, 'must be a non-negative integer')
  }
  return value
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be an array')
  return value
}

function validateShuowen(value: unknown, path: string): ShuowenGloss {
  const record = expectObject(value, path)
  const status = record.vernacularStatus
  if (status !== 'draft' && status !== 'reviewed') {
    fail(`${path}.vernacularStatus`, 'must be "draft" or "reviewed"')
  }
  let correction: CorrectionRef | null = null
  if (record.correction !== null && record.correction !== undefined) {
    const source = expectObject(record.correction, `${path}.correction`)
    correction = {
      text: expectString(source.text, `${path}.correction.text`),
      source: expectString(source.source, `${path}.correction.source`),
    }
  }
  return {
    original: expectString(record.original, `${path}.original`),
    vernacular: expectString(record.vernacular, `${path}.vernacular`, true),
    vernacularStatus: status,
    correction,
  }
}

function validateHeadword(value: unknown, path: string): HeadwordRecord {
  const record = expectObject(value, path)
  const sources = expectObject(record.sources, `${path}.sources`)
  return {
    shuowen: validateShuowen(record.shuowen, `${path}.shuowen`),
    pinyin: expectNullableString(record.pinyin, `${path}.pinyin`),
    radical: expectNullableString(record.radical, `${path}.radical`),
    glyphChars: expectArray(record.glyphChars, `${path}.glyphChars`).map((entry, index) =>
      expectString(entry, `${path}.glyphChars[${index}]`),
    ),
    sources: { shuowen: expectString(sources.shuowen, `${path}.sources.shuowen`) },
  }
}

const RESOLVED_BY = new Set<ResolvedBy>([
  'manual-headword',
  'exact-sw',
  'reverse-w',
  'opencc',
  'ts',
  'none',
])

function validateGlyph(value: unknown, path: string): GlyphRecord {
  const record = expectObject(value, path)
  const resolvedBy = record.resolvedBy
  if (typeof resolvedBy !== 'string' || !RESOLVED_BY.has(resolvedBy as ResolvedBy)) {
    fail(`${path}.resolvedBy`, 'must be a known resolution path')
  }
  return {
    headword: expectNullableString(record.headword, `${path}.headword`),
    resolvedBy: resolvedBy as ResolvedBy,
  }
}

/**
 * Parse and validate the raw JSON value. Throws `DataUnavailableError`.
 * Never repairs, never guesses: a corrupt file must surface as a tool error,
 * not as a silently empty corpus.
 */
export function validateOracleData(raw: unknown): OracleData {
  const root = expectObject(raw, 'oracle')
  const schemaVersion = expectCount(root.schemaVersion, 'oracle.schemaVersion')
  if (schemaVersion !== ORACLE_SCHEMA_VERSION) {
    throw new DataUnavailableError(
      `oracle.schemaVersion: expected ${ORACLE_SCHEMA_VERSION}, got ${schemaVersion}`,
    )
  }

  const source = expectObject(root.source, 'oracle.source')
  const countsRaw = expectObject(root.counts, 'oracle.counts')
  const counts: OracleCounts = {
    glyphs: expectCount(countsRaw.glyphs, 'oracle.counts.glyphs'),
    glossedGlyphs: expectCount(countsRaw.glossedGlyphs, 'oracle.counts.glossedGlyphs'),
    glyphOnly: expectCount(countsRaw.glyphOnly, 'oracle.counts.glyphOnly'),
    headwords: expectCount(countsRaw.headwords, 'oracle.counts.headwords'),
    sharedHeadwords: expectCount(countsRaw.sharedHeadwords, 'oracle.counts.sharedHeadwords'),
    aliases: expectCount(countsRaw.aliases, 'oracle.counts.aliases'),
  }

  const headwordsRaw = expectObject(root.headwords, 'oracle.headwords')
  const headwords: Record<string, HeadwordRecord> = {}
  for (const [key, value] of Object.entries(headwordsRaw)) {
    headwords[key] = validateHeadword(value, `oracle.headwords.${key}`)
  }

  const glyphsRaw = expectObject(root.glyphs, 'oracle.glyphs')
  const glyphs: Record<string, GlyphRecord> = {}
  for (const [key, value] of Object.entries(glyphsRaw)) {
    glyphs[key] = validateGlyph(value, `oracle.glyphs.${key}`)
  }

  const aliasesRaw = expectObject(root.aliases, 'oracle.aliases')
  const aliases: Record<string, string> = {}
  for (const [key, value] of Object.entries(aliasesRaw)) {
    aliases[key] = expectString(value, `oracle.aliases.${key}`)
  }

  // Referential integrity (CLAUDE.md §3.2 step 10, §3.8 step 4).
  for (const [char, record] of Object.entries(glyphs)) {
    if (record.headword !== null && headwords[record.headword] === undefined) {
      fail(`oracle.glyphs.${char}.headword`, `references missing headword ${record.headword}`)
    }
  }
  const referenced = new Set<string>()
  for (const record of Object.values(glyphs)) {
    if (record.headword !== null) referenced.add(record.headword)
  }
  for (const headword of Object.keys(headwords)) {
    if (!referenced.has(headword)) {
      fail(`oracle.headwords.${headword}`, 'is not referenced by any glyph')
    }
  }
  for (const [key, target] of Object.entries(aliases)) {
    if (glyphs[key] !== undefined) {
      fail(`oracle.aliases.${key}`, 'collides with a glyphChar')
    }
    if (glyphs[target] === undefined) {
      fail(`oracle.aliases.${key}`, `targets missing glyph ${target}`)
    }
  }

  if (counts.glyphs !== Object.keys(glyphs).length) {
    fail('oracle.counts.glyphs', `says ${counts.glyphs}, data has ${Object.keys(glyphs).length}`)
  }
  if (counts.headwords !== Object.keys(headwords).length) {
    fail('oracle.counts.headwords', `says ${counts.headwords}, data has ${Object.keys(headwords).length}`)
  }
  if (counts.aliases !== Object.keys(aliases).length) {
    fail('oracle.counts.aliases', `says ${counts.aliases}, data has ${Object.keys(aliases).length}`)
  }

  return {
    schemaVersion,
    generatedAt: expectString(root.generatedAt, 'oracle.generatedAt'),
    source: {
      yigezi: expectString(source.yigezi, 'oracle.source.yigezi'),
      shuowen: expectString(source.shuowen, 'oracle.source.shuowen'),
      font: expectString(source.font, 'oracle.source.font'),
    },
    counts,
    headwords,
    glyphs,
    aliases,
  }
}
