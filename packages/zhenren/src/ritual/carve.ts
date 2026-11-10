/**
 * Carving rhythm (CLAUDE.md §5.5).
 *
 * Every slot gets a start time, duration, pressure, and mask seed. The client
 * only plays this timeline; it never re-draws randomness. Missing slots linger
 * about 1.5× longer so the 空刻 is actually seen.
 */
import type { CarveStep } from '../contract.js'
import { createRng, deriveSeed } from '../shared/rng.js'

export interface CarvePlan {
  version: 1
  chars: CarveStep[]
}

/** Silence before the first stroke. */
const LEAD_IN_MS = 300

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Build the per-slot rhythm.
 * `slots` must come from the glyph plan so that slot numbers line up 1:1 with
 * the layout and the meta glyph list.
 */
export function planCarve(
  seed: string,
  slots: readonly { slot: number; found: boolean }[],
): CarvePlan {
  const rng = createRng(deriveSeed(seed, 'carve'))
  const chars: CarveStep[] = []
  let cursor = LEAD_IN_MS
  for (const slot of slots) {
    const base = rng.range(180, 420)
    const durationMs = Math.round(slot.found ? base : base * 1.5)
    // Two draws averaged → mostly mid pressure, rarely very light or very deep.
    const pressure = round(0.55 + ((rng.next() + rng.next()) / 2) * 0.45, 2)
    chars.push({
      slot: slot.slot,
      startMs: Math.round(cursor),
      durationMs,
      pressure,
      maskSeed: rng.int(1, 2 ** 31 - 1),
    })
    cursor += durationMs + rng.range(50, 120)
    if (!slot.found) cursor += rng.range(60, 140)
  }
  return { version: 1, chars }
}

/** Total timeline length in milliseconds. */
export function carveDuration(plan: CarvePlan): number {
  let end = 0
  for (const step of plan.chars) end = Math.max(end, step.startMs + step.durationMs)
  return end
}
