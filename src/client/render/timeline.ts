/**
 * Card timelines (CLAUDE.md §5.2, §5.8).
 *
 * The timeline is derived purely from elapsed time and the persisted spec, so
 * a remount can jump straight to the final frame and a replay restarts from
 * the same numbers.
 */
import type { CarveStep } from '../../contract.js'
import type { OmenPhase } from './cracks.js'

export interface BurnTimeline {
  /** Heat reaches its peak. */
  heatPeakMs: number
  /** Crack growth begins. */
  crackStartMs: number
  /** Crack growth completes; the label starts fading in. */
  crackEndMs: number
  /** Final frame is stable. */
  totalMs: number
}

export const BURN_TIMELINE: BurnTimeline = {
  heatPeakMs: 700,
  crackStartMs: 900,
  crackEndMs: 2300,
  totalMs: 2800,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function easeInOut(t: number): number {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

export interface BurnFrame extends OmenPhase {
  /** Opacity of the auspice label, 0..1. */
  label: number
  /** Whether the animation has reached its final frame. */
  done: boolean
}

/** Heat and crack progress at `elapsedMs` into the burn card. */
export function burnFrame(elapsedMs: number): BurnFrame {
  const heat =
    elapsedMs <= BURN_TIMELINE.heatPeakMs
      ? clamp(elapsedMs / BURN_TIMELINE.heatPeakMs, 0, 1)
      : elapsedMs <= BURN_TIMELINE.crackStartMs
        ? 1
        : 1 - 0.82 * easeInOut((elapsedMs - BURN_TIMELINE.crackStartMs) / (BURN_TIMELINE.crackEndMs - BURN_TIMELINE.crackStartMs))
  const crack = clamp(
    (elapsedMs - BURN_TIMELINE.crackStartMs) / (BURN_TIMELINE.crackEndMs - BURN_TIMELINE.crackStartMs),
    0,
    1,
  )
  return {
    heat,
    crack: easeInOut(crack),
    label: clamp((elapsedMs - BURN_TIMELINE.crackEndMs) / 400, 0, 1),
    done: elapsedMs >= BURN_TIMELINE.totalMs,
  }
}

/** Static final frame. */
export const BURN_FINAL: BurnFrame = { heat: 0.18, crack: 1, label: 1, done: true }

/** Total carve-card duration; a short hold after the last stroke. */
export function carveTotalMs(steps: readonly CarveStep[]): number {
  let end = 0
  for (const step of steps) end = Math.max(end, step.startMs + step.durationMs)
  return end + 500
}

/**
 * Per-slot carve progress at `elapsedMs`.
 * Slots absent from the plan stay at 0; that never happens for a valid meta.
 */
export function carveFrame(steps: readonly CarveStep[], elapsedMs: number): Map<number, number> {
  const progress = new Map<number, number>()
  for (const step of steps) {
    const raw = (elapsedMs - step.startMs) / Math.max(1, step.durationMs)
    progress.set(step.slot, easeInOut(raw))
  }
  return progress
}
