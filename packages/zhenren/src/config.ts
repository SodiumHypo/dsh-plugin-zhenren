/**
 * Plugin configuration (CLAUDE.md §4.10).
 *
 * Data paths, font paths, and seeds are deliberately absent: they are internal
 * implementation details, not policy. Presentation choices are copied into
 * `presentationMeta` so the client never reads host config directly.
 */
import Schema from '@deepseek-ai/schemastery'
import type { AnimationLevel } from './contract.js'
import type { RitualInvoke } from './prompt.js'
import type { AuspiceBalance } from './ritual/auspice.js'

export type { AnimationLevel, AuspiceBalance, RitualInvoke }

export interface Config {
  /** When false, the plugin registers nothing. @default true */
  enabled?: boolean
  /** Client animation level; system reduced-motion still wins. @default 'full' */
  animation?: AnimationLevel
  /** Upper bound on carvable slots per inscription. @default 48 */
  maxInscriptionChars?: number
  /** Omen distribution bias. Never changes the returned auspice's authority. @default 'balanced' */
  auspiceBalance?: AuspiceBalance
  /** Whether cards offer the 说文 original. @default true */
  showShuowen?: boolean
  /** UI locale; classical text is never translated. @default 'zh-CN' */
  locale?: string
  /** Name used in the fixed 前辞 opening `<干支>卜，<name>贞：`. @default '鱼' */
  divinerName?: string
  /** Divination invocation weight (F1): auto only on ritual intent. @default 'auto' */
  ritualInvoke?: RitualInvoke
}

/** Schemastery schema, the shape dsh loads from the profile. */
export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true),
  animation: Schema.union(['full', 'reduced', 'off']).default('full'),
  maxInscriptionChars: Schema.number().step(1).min(1).max(48).default(48),
  auspiceBalance: Schema.union(['balanced', 'gentle', 'stern']).default('balanced'),
  showShuowen: Schema.boolean().default(true),
  locale: Schema.string().default('zh-CN'),
  divinerName: Schema.string().default('鱼'),
  ritualInvoke: Schema.union(['auto', 'always']).default('auto'),
})

/** Config with every default applied. */
export interface ResolvedConfig {
  readonly enabled: boolean
  readonly animation: AnimationLevel
  readonly maxInscriptionChars: number
  readonly auspiceBalance: AuspiceBalance
  readonly showShuowen: boolean
  readonly locale: string
  readonly divinerName: string
  readonly ritualInvoke: RitualInvoke
}

/** Apply defaults and clamp the one numeric bound that layout also enforces. */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const maxInscriptionChars = config.maxInscriptionChars ?? 48
  const divinerName = (config.divinerName ?? '鱼').trim().slice(0, 4)
  return {
    enabled: config.enabled ?? true,
    animation: config.animation ?? 'full',
    maxInscriptionChars: Math.max(1, Math.min(48, Math.round(maxInscriptionChars))),
    auspiceBalance: config.auspiceBalance ?? 'balanced',
    showShuowen: config.showShuowen ?? true,
    locale: config.locale ?? 'zh-CN',
    divinerName: divinerName === '' ? '鱼' : divinerName,
    ritualInvoke: config.ritualInvoke ?? 'auto',
  }
}
