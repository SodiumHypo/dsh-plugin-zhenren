/**
 * Choosing the single authoritative omen (CLAUDE.md §4.4, §5.4).
 *
 * `tone` is a directorial hint: it shifts the distribution and never
 * guarantees an outcome. Whatever this function returns is final; the model
 * must not reinterpret it later.
 */
import type { Auspice } from '../contract.js'
import { createRng, deriveSeed } from '../shared/rng.js'

export type AuspiceBalance = 'balanced' | 'gentle' | 'stern'
export type AuspiceTone = '吉' | '凶' | '中性'

const BASE_WEIGHTS: Record<AuspiceBalance, Record<Auspice, number>> = {
  balanced: { 吉: 0.33, 中性: 0.34, 凶: 0.33 },
  gentle: { 吉: 0.45, 中性: 0.35, 凶: 0.2 },
  stern: { 吉: 0.25, 中性: 0.3, 凶: 0.45 },
}

/** Multipliers applied before renormalization, so no outcome becomes impossible. */
const TONE_MULTIPLIERS: Record<AuspiceTone, Record<Auspice, number>> = {
  吉: { 吉: 2.2, 中性: 1, 凶: 0.55 },
  凶: { 吉: 0.55, 中性: 1, 凶: 2.2 },
  中性: { 吉: 1, 中性: 1, 凶: 1 },
}

const ORDER: readonly Auspice[] = ['吉', '中性', '凶']

function weightsFor(balance: AuspiceBalance, tone?: AuspiceTone): Record<Auspice, number> {
  const base = BASE_WEIGHTS[balance]
  const multipliers = tone === undefined ? undefined : TONE_MULTIPLIERS[tone]
  const weights: Record<Auspice, number> = multipliers === undefined
    ? { ...base }
    : { 吉: base.吉 * multipliers.吉, 中性: base.中性 * multipliers.中性, 凶: base.凶 * multipliers.凶 }
  const total = weights.吉 + weights.中性 + weights.凶
  return { 吉: weights.吉 / total, 中性: weights.中性 / total, 凶: weights.凶 / total }
}

/** Draw the omen. Same seed + same settings → same result. */
export function chooseAuspice(
  seed: string,
  tone: AuspiceTone | undefined,
  balance: AuspiceBalance,
): Auspice {
  const rng = createRng(deriveSeed(seed, 'auspice'))
  const weights = weightsFor(balance, tone)
  const roll = rng.next()
  let accumulated = 0
  for (const candidate of ORDER) {
    accumulated += weights[candidate]
    if (roll < accumulated) return candidate
  }
  return '凶'
}
