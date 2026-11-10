/**
 * Single-character query contract (CLAUDE.md §3.5).
 *
 * Fixed order, no exceptions:
 *   1. input is itself one of the 1,425 glyphs  → matchedBy: 'glyph'
 *   2. input is an alias key                    → matchedBy: 'alias'
 *   3. otherwise                                → found: false
 *
 * Step 1 runs first on purpose. 明 and 朙 both have glyphs and both point at
 * headword 朙; someone who typed 明 must see 明 carved, not 朙.
 *
 * `found` means "has an oracle glyph", never "has a 说文 gloss".
 */
import type { OracleIndex } from './load.js'
import type { GlyphRecord, OracleLookup, OracleLookupFound, SourceRef } from './schema.js'

/** A single Han character. Matches astral-plane ideographs too. */
const HAN_CHARACTER = /\p{Script=Han}/u
/**
 * Zero-width space/joiners and BOM, which copy-paste adds.
 * Compared as codepoints on purpose: a regex literal here would need the
 * invisible characters themselves, which are unreviewable in source.
 */
const INVISIBLE_CODEPOINTS = new Set([0x200b, 0x200c, 0x200d, 0xfeff])

function isInvisible(char: string): boolean {
  const code = char.codePointAt(0)
  if (code === undefined) return false
  return INVISIBLE_CODEPOINTS.has(code) || /\s/u.test(char)
}

/** Result of cleaning one raw input string. */
export interface NormalizedQuery {
  /** NFC, invisible characters removed. */
  cleaned: string
  /** First Han character in `cleaned`, or `null` when there is none. */
  char: string | null
}

/** Normalize one query string without guessing at near-matches. */
export function normalizeQuery(input: string): NormalizedQuery {
  const cleaned = Array.from(input.normalize('NFC'))
    .filter((char) => !isInvisible(char))
    .join('')
  const match = HAN_CHARACTER.exec(cleaned)
  return { cleaned, char: match === null ? null : match[0] }
}

/**
 * Split free text into the Han characters that can be carved.
 * Punctuation and whitespace are dropped: 甲骨卜辞 has no such glyphs, and a
 * dropped mark must never become a "missing character" entry.
 */
export function splitHanCharacters(text: string): string[] {
  return Array.from(text.normalize('NFC')).filter((char) => HAN_CHARACTER.test(char))
}

function toFound(
  query: string,
  glyphChar: string,
  record: GlyphRecord,
  matchedBy: 'glyph' | 'alias',
  index: OracleIndex,
): OracleLookupFound {
  const headword = record.headword
  const headwordRecord = headword === null ? undefined : index.headwords.get(headword)
  const shuowen = headwordRecord === undefined ? null : headwordRecord.shuowen
  const sources: SourceRef[] = [{ kind: 'oracleGlyph', value: 'Oracular (yigezi)' }]
  if (shuowen !== null && headwordRecord !== undefined) {
    sources.push({ kind: 'shuowen', value: headwordRecord.sources.shuowen })
  }
  if (shuowen !== null && shuowen.correction !== null) {
    sources.push({ kind: 'correction', value: shuowen.correction.source })
  }
  return {
    found: true,
    query,
    normalized: glyphChar,
    glyphChar,
    headword,
    shuowen,
    matchedBy,
    sources,
  }
}

/** Query one character. Never returns a near-match. */
export function lookupOracle(index: OracleIndex, input: string): OracleLookup {
  const { cleaned, char } = normalizeQuery(input)
  if (char === null) {
    return {
      found: false,
      query: input,
      normalized: cleaned,
      reason: 'empty-query',
      supportedCount: index.supportedCount,
    }
  }

  const direct = index.glyphs.get(char)
  if (direct !== undefined) {
    return toFound(input, char, direct, 'glyph', index)
  }

  const aliasTarget = index.aliases.get(char)
  if (aliasTarget !== undefined) {
    const record = index.glyphs.get(aliasTarget)
    // The loader rejects aliases targeting unknown glyphs; this is defensive.
    if (record !== undefined) {
      return toFound(input, aliasTarget, record, 'alias', index)
    }
  }

  return {
    found: false,
    query: input,
    normalized: char,
    reason: 'not-in-oracle-corpus',
    supportedCount: index.supportedCount,
  }
}
