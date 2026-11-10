/**
 * Runtime loader for `data/oracle.json` (CLAUDE.md §3.8).
 *
 * Reads once, validates, builds three immutable Maps, and freezes the records.
 * No database, no watcher, no lazy loading, no module-level singleton: the
 * caller (the plugin's `apply`) owns the instance and it dies with the fiber.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DataUnavailableError,
  validateOracleData,
  type GlyphRecord,
  type HeadwordRecord,
  type OracleCounts,
  type OracleData,
} from './schema.js'

/** Immutable in-memory view of the corpus. */
export interface OracleIndex {
  readonly schemaVersion: number
  readonly generatedAt: string
  readonly counts: OracleCounts
  readonly headwords: ReadonlyMap<string, HeadwordRecord>
  readonly glyphs: ReadonlyMap<string, GlyphRecord>
  readonly aliases: ReadonlyMap<string, string>
  /** Number of characters with an oracle glyph; quoted in "not found" replies. */
  readonly supportedCount: number
}

export interface LoadOracleOptions {
  /** Override the data directory. Tests use this; production omits it. */
  dataDir?: string
}

/** How far up from the compiled module to look for `data/oracle.json`. */
const MAX_ANCESTOR_HOPS = 4

/**
 * Locate the data directory by walking up from this module.
 *
 * The plugin ships `data/` next to `lib/`, so this works from both
 * `src/data/load.ts` (tests) and `lib/index.js` (built host half) without a
 * build-time path substitution.
 */
export function resolveDataDir(dataDir?: string): string {
  if (dataDir !== undefined) return dataDir
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let hop = 0; hop < MAX_ANCESTOR_HOPS; hop++) {
    const candidate = path.join(dir, 'data')
    if (fs.existsSync(path.join(candidate, 'oracle.json'))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new DataUnavailableError(
    'data-unavailable: could not locate data/oracle.json next to the plugin',
  )
}

/** Recursively freeze plain data so a stray write cannot corrupt the corpus. */
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

/** Read and parse the JSON file, converting every failure to DataUnavailableError. */
function readOracleFile(dataDir: string): OracleData {
  const file = path.join(dataDir, 'oracle.json')
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (cause) {
    throw new DataUnavailableError(`data-unavailable: cannot read ${file}`, { cause })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new DataUnavailableError(`data-unavailable: ${file} is not valid JSON`, { cause })
  }
  return validateOracleData(parsed)
}

/**
 * Load the corpus and build the query index.
 * @throws DataUnavailableError when the file is missing, corrupt, or inconsistent.
 */
export function loadOracleIndex(options: LoadOracleOptions = {}): OracleIndex {
  const dataDir = resolveDataDir(options.dataDir)
  const data = readOracleFile(dataDir)

  const headwords = new Map<string, HeadwordRecord>()
  for (const [key, record] of Object.entries(data.headwords)) {
    headwords.set(key, deepFreeze(record))
  }
  const glyphs = new Map<string, GlyphRecord>()
  for (const [key, record] of Object.entries(data.glyphs)) {
    glyphs.set(key, deepFreeze(record))
  }
  const aliases = new Map<string, string>(Object.entries(data.aliases))
  deepFreeze(data.counts)

  return Object.freeze({
    schemaVersion: data.schemaVersion,
    generatedAt: data.generatedAt,
    counts: data.counts,
    headwords,
    glyphs,
    aliases,
    supportedCount: glyphs.size,
  })
}
