/**
 * Daily-glyph cycle state (D22, F3).
 *
 * One cycle traverses the entire glyph corpus exactly once: `seen` deduplicates,
 * selection excludes `seen`, and a full round opens a new cycle (clear `seen`,
 * reset `cycleStart`). The pick changes on the next local-calendar day and is
 * stable within a day. Selection is deterministic — seeded by `cycleStart` and
 * the number already seen — so the same state always yields the same glyph.
 *
 * This module is pure: it never touches `localStorage` itself. The widget passes
 * a storage handle in, and tests inject fixtures. Corrupt or missing state
 * rebuilds a fresh cycle rather than throwing.
 */
import { createRng } from '../shared/rng.js'

/** Stable, install-path-independent storage key (D22). */
export const DAILY_STORAGE_KEY = 'zhenren.daily.v1'

/** Persisted cycle state. `today` caches the current local day's pick. */
export interface DailyState {
  schemaVersion: 1
  /** Local date (YYYY-MM-DD) the current cycle began. */
  cycleStart: string
  /** glyphChars already shown this cycle, in order. */
  seen: string[]
  /** The pick for `date`, cached so same-day revisits do not advance the cycle. */
  today: { date: string; char: string } | null
}

/** Local-calendar date (not UTC), so "next day" follows the user's timezone. */
export function localDate(now: Date): string {
  const y = now.getFullYear()
  const m = `${now.getMonth() + 1}`.padStart(2, '0')
  const d = `${now.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** A fresh cycle starting on `cycleStart`, nothing seen yet. */
export function emptyDailyState(cycleStart: string): DailyState {
  return { schemaVersion: 1, cycleStart, seen: [], today: null }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate persisted state; `null` means "corrupt, rebuild a fresh cycle". */
export function parseDailyState(value: unknown): DailyState | null {
  if (!isObject(value) || value.schemaVersion !== 1) return null
  if (typeof value.cycleStart !== 'string') return null
  if (!Array.isArray(value.seen) || value.seen.some((c) => typeof c !== 'string')) return null
  let today: DailyState['today'] = null
  if (value.today !== null) {
    if (!isObject(value.today) || typeof value.today.date !== 'string' || typeof value.today.char !== 'string') {
      return null
    }
    today = { date: value.today.date, char: value.today.char }
  }
  return { schemaVersion: 1, cycleStart: value.cycleStart, seen: [...value.seen], today }
}

/**
 * Resolve today's glyph and the advanced state. Pure given (state, corpus, date).
 * @param state - persisted cycle state (already validated).
 * @param corpus - the full glyphChar list, in a stable order.
 * @param date - the current local date.
 * @returns the next state and the glyph to show; `char` is '' for an empty corpus.
 */
export function pickDaily(
  state: DailyState,
  corpus: readonly string[],
  date: string,
): { state: DailyState; char: string } {
  if (corpus.length === 0) return { state, char: '' }

  // Same local day, and the cached glyph still exists in this corpus version.
  if (state.today !== null && state.today.date === date && corpus.includes(state.today.char)) {
    return { state, char: state.today.char }
  }

  // A completed round opens a new cycle before picking.
  let cycleStart = state.cycleStart
  let seen = state.seen.filter((c) => corpus.includes(c))
  if (seen.length >= corpus.length) {
    cycleStart = date
    seen = []
  }

  const seenSet = new Set(seen)
  let candidates = corpus.filter((c) => !seenSet.has(c))
  if (candidates.length === 0) {
    // Defensive: corpus shrank between visits; restart the cycle.
    cycleStart = date
    seen = []
    candidates = [...corpus]
  }

  const rng = createRng(`daily:${cycleStart}:${seen.length}`)
  const char = rng.pick(candidates)
  const next: DailyState = {
    schemaVersion: 1,
    cycleStart,
    seen: [...seen, char],
    today: { date, char },
  }
  return { state: next, char }
}

/** Minimal storage faces, so tests can inject a fake and node can pass nothing. */
export type ReadStorage = Pick<Storage, 'getItem'>
export type WriteStorage = Pick<Storage, 'setItem'>

/** Read and validate state; any failure rebuilds a fresh cycle on `date`. */
export function readDailyState(storage: ReadStorage | undefined, date: string): DailyState {
  if (storage === undefined) return emptyDailyState(date)
  try {
    const raw = storage.getItem(DAILY_STORAGE_KEY)
    if (raw === null) return emptyDailyState(date)
    return parseDailyState(JSON.parse(raw)) ?? emptyDailyState(date)
  } catch {
    return emptyDailyState(date)
  }
}

/** Persist state; quota/private-mode failures are swallowed (UI state, not data). */
export function writeDailyState(storage: WriteStorage | undefined, state: DailyState): void {
  if (storage === undefined) return
  try {
    storage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore: the daily glyph is a convenience, never a hard requirement.
  }
}