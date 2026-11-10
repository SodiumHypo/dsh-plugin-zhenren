/**
 * Deterministic pseudo-randomness (CLAUDE.md §5.3).
 *
 * `Math.random()` is banned: a divination replay must produce the same cracks
 * and the same carving rhythm from the same seed, byte for byte.
 *
 * Pure on purpose: the browser half uses the same PRNG to place shell texture
 * and carve speckle, and it must never reach for `node:crypto` or any host
 * module. Seed creation lives in `ritual/random.ts` because it needs the OS
 * entropy source.
 */

/** Small deterministic PRNG surface used by every generator. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform in [min, max). */
  range(min: number, max: number): number
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number
  /** Uniform choice; `items` must be non-empty. */
  pick<T>(items: readonly T[]): T
  /** True with the given probability. */
  chance(probability: number): boolean
}

/** Allowed seed alphabet: compact, URL-safe, log-safe. */
const SEED_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** True when `value` is an acceptable seed supplied by a caller. */
export function isSeed(value: string): boolean {
  return SEED_PATTERN.test(value)
}

/** FNV-1a over UTF-16 code units. Stable across platforms and Node versions. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Build a PRNG from a seed string. Same seed → same sequence, always. */
export function createRng(seed: string): Rng {
  let state = hashSeed(seed)
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range(min, max) {
      return min + next() * (max - min)
    },
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1))
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('rng.pick: empty sequence')
      const item = items[Math.floor(next() * items.length)]
      if (item === undefined) throw new RangeError('rng.pick: empty sequence')
      return item
    },
    chance(probability) {
      return next() < probability
    },
  }
}

/**
 * Derive a child seed. Used so that different stages (auspice, cracks, carve)
 * draw from independent streams instead of sharing one sequence; adding a
 * stage later cannot shift the output of an earlier one.
 */
export function deriveSeed(seed: string, stage: string): string {
  return `${seed}:${stage}`
}
