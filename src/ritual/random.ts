/**
 * Seed creation, isolated from the pure PRNG so the browser bundle never
 * reaches for `node:crypto` (CLAUDE.md §5.3).
 */
import { randomBytes } from 'node:crypto'

/** Create a fresh seed. Only this call touches the OS entropy source. */
export function generateSeed(): string {
  return randomBytes(8).toString('hex')
}
