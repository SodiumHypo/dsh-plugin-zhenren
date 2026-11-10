/**
 * Browser half of 甲骨贞人 (CLAUDE.md §4.8).
 *
 * Registers the locale dictionaries and the two keyed tool views. The slot key
 * must equal the wire tool name exactly; a typo silently falls back to the
 * generic row, so the names come from the shared contract.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.locale service merge and PropsLocale.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ctx.slots service merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `tool.call.toolview` slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { TOOL_BURN, TOOL_INSCRIBE } from '../contract.js'
import { dictionaries, NS } from './locale.js'
import { BurnRow } from './views/BurnRow.js'
import { InscribeRow } from './views/InscribeRow.js'

/** Services the browser half reads. */
export const inject = ['slots', 'locale']

/**
 * Install the cards.
 * @param ctx - client root context carrying the slot registry and locale.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'zhenren: dictionaries')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: TOOL_BURN, locale: NS },
    BurnRow,
  ))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: TOOL_INSCRIBE, locale: NS },
    InscribeRow,
  ))
}
