/**
 * Turning text into carvable slots (CLAUDE.md §3.6, §4.4, §4.5).
 *
 * The corpus boundary is enforced here and nowhere else: every Han character
 * becomes a slot, every slot is queried once, and an unknown character keeps
 * its slot as a 空刻 placeholder. Nothing is substituted.
 */
import { lookupOracle, splitHanCharacters } from '../data/lookup.js'
import type { OracleIndex } from '../data/load.js'
import type { OracleLookup } from '../data/schema.js'

export interface GlyphPlanEntry {
  slot: number
  char: string
  lookup: OracleLookup
}

export interface GlyphPlan {
  entries: GlyphPlanEntry[]
  /** Unique characters with no oracle glyph, in first-appearance order. */
  missing: string[]
}

/** Query each Han character of `text`, preserving duplicates and order. */
export function planGlyphs(index: OracleIndex, text: string): GlyphPlan {
  const entries: GlyphPlanEntry[] = []
  const missing: string[] = []
  const seen = new Set<string>()
  for (const char of splitHanCharacters(text)) {
    const lookup = lookupOracle(index, char)
    entries.push({ slot: entries.length, char, lookup })
    if (!lookup.found && !seen.has(char)) {
      seen.add(char)
      missing.push(char)
    }
  }
  return { entries, missing }
}

/** Compact per-character record for the burn result. */
export function toChargeGlyphs(plan: GlyphPlan): Array<{
  char: string
  found: boolean
  headword?: string | null
  glyphChar?: string
  glossFound?: boolean
}> {
  return plan.entries.map((entry) => {
    if (!entry.lookup.found) return { char: entry.char, found: false }
    return {
      char: entry.char,
      found: true,
      headword: entry.lookup.headword,
      glyphChar: entry.lookup.glyphChar,
      glossFound: entry.lookup.shuowen !== null,
    }
  })
}
