/**
 * Host half of 甲骨贞人 (CLAUDE.md §4.8).
 *
 * Registers the two ritual tools and the 贞人 protocol section. The corpus is
 * loaded lazily on the first tool call, so a broken `data/oracle.json` becomes a
 * `data-unavailable` tool error instead of a plugin that fails to load.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'

import type { Config } from './config.js'
import { resolveConfig } from './config.js'
import { loadOracleIndex, type OracleIndex } from './data/load.js'
import { PROMPT_SECTION_NAME, PROMPT_TEXT, promptSectionOrder } from './prompt.js'
import { createBurnTool } from './tools/burn.js'
import { createInscribeTool } from './tools/inscribe.js'
import { createDivinationMemory } from './tools/shared.js'

export { Config } from './config.js'

/** Plugin name shown by dsh. */
export const name = 'dsh-plugin-zhenren'

/** Services the host half reads. Nothing else is required. */
export const inject = ['tools', 'systemPrompt']

/**
 * Install the ritual.
 * @param ctx - host context carrying the tool registry and the prompt registry.
 * @param config - profile configuration, already validated by {@link Config}.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = resolveConfig(config)
  if (!resolved.enabled) return

  let cached: OracleIndex | undefined
  const getIndex = (): OracleIndex => {
    cached ??= loadOracleIndex()
    return cached
  }

  // Bounded, process-local, never authoritative (CLAUDE.md §4.7).
  const memory = createDivinationMemory()

  ctx.tools.register(createBurnTool({ getIndex, config: resolved, memory }))
  ctx.tools.register(createInscribeTool({ getIndex, config: resolved, memory }))
  ctx.systemPrompt.section({
    name: PROMPT_SECTION_NAME,
    order: promptSectionOrder(ctx),
    text: PROMPT_TEXT,
  })
}
