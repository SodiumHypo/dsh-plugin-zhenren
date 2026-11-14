/**
 * Tool-layer helpers shared by burn and inscribe.
 *
 * The in-process cache is explicitly NOT authoritative (CLAUDE.md §4.7): the
 * session log plus `presentationMeta` is the record. The cache only lets the
 * inscribe card reuse the burn card's omen while the process is alive.
 */
import { randomBytes } from 'node:crypto'
import type { Auspice, CrackSpec } from '../contract.js'

/** Everything the inscribe tool needs to keep one 甲面 continuous. */
export interface StoredDivination {
  id: string
  seed: string
  auspice: Auspice
  burnPoint: { x: number; y: number }
  question: string
  charge: string
  cracks: CrackSpec
  storedAt: number
}

export interface DivinationMemory {
  get(id: string): StoredDivination | undefined
  set(value: StoredDivination): void
  readonly size: number
}

/**
 * Bounded LRU over `Map` insertion order. Re-inserting on read keeps the hot
 * divination alive; nothing here survives a restart, by design.
 */
export function createDivinationMemory(limit = 64): DivinationMemory {
  const entries = new Map<string, StoredDivination>()
  return {
    get(id) {
      const entry = entries.get(id)
      if (entry === undefined) return undefined
      entries.delete(id)
      entries.set(id, entry)
      return entry
    },
    set(value) {
      entries.delete(value.id)
      entries.set(value.id, value)
      while (entries.size > limit) {
        const oldest = entries.keys().next()
        if (oldest.done === true) break
        entries.delete(oldest.value)
      }
    },
    get size() {
      return entries.size
    },
  }
}

const DIVINATION_ID = /^div_[a-z0-9]{6,40}$/

/** True when `value` has the shape this plugin issues. */
export function isDivinationId(value: string): boolean {
  return DIVINATION_ID.test(value)
}

/** Create a fresh id. Uniqueness comes from time plus OS entropy, not Math.random. */
export function newDivinationId(): string {
  return `div_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
}

/** Throw a message the model can act on. The runtime turns this into a tool error. */
export function invalid(message: string): never {
  throw new Error(`invalid arguments: ${message}`)
}
