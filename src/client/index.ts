/**
 * Browser half of 甲骨贞人 (CLAUDE.md §4.8).
 *
 * Registers the locale dictionaries, the prose-inline font (D21), the three
 * keyed tool views, and the daily-glyph dock entry (F3). A tool view's slot key
 * must equal the wire tool name exactly; a typo silently falls back to the
 * generic row, so the names come from the shared contract. The dock is a list
 * slot keyed by a stable id, not a tool name.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.locale service merge and PropsLocale.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ctx.slots service merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `tool.call.toolview` slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: pulls the `conversation.composer.dock` slot declaration (F3).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the `settings.section` slot declaration (F4, D27).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { TOOL_BURN, TOOL_INSCRIBE, TOOL_LOOKUP } from '../contract.js'
import { installInlineFont } from './inline-font.js'
import { dictionaries, NS } from './locale.js'
import { BurnRow } from './views/BurnRow.js'
import { DailyGlyphDock } from './views/DailyGlyphDock.js'
import { InscribeRow } from './views/InscribeRow.js'
import { LookupRow } from './views/LookupRow.js'
import { SettingsSection } from './views/SettingsSection.js'
import { UpdateNotice } from './views/UpdateNotice.js'

/** Services the browser half reads. */
export const inject = ['slots', 'locale']

/**
 * Install the cards and the daily-glyph dock.
 * @param ctx - client root context carrying the slot registry and locale.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'zhenren: dictionaries')
  // Prose-inline oracle font (D21): PUA-only, gated by unicode-range.
  installInlineFont(ctx)
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: TOOL_BURN, locale: NS },
    BurnRow,
  ))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: TOOL_INSCRIBE, locale: NS },
    InscribeRow,
  ))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: TOOL_LOOKUP, locale: NS },
    LookupRow,
  ))
  // Daily glyph (F3): an ambient dock pill, ordered after the chat stats pills.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
    { name: 'conversation.composer.dock', id: 'zhenren.daily', order: 50, locale: NS },
    DailyGlyphDock,
  ))
  // Update notice (F4): a conditional dock pill, only when a newer version exists.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
    { name: 'conversation.composer.dock', id: 'zhenren.update', order: 51, locale: NS },
    UpdateNotice,
  ))
  // Preferences (F4, D27): a dedicated settings page owning the update check
  // and local state; ordered after the built-in sections (account -10 …
  // agent-presets 20). The nav label is registrant-localized.
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    {
      name: 'settings.section',
      id: 'zhenren',
      order: 60,
      label: () => ctx.locale.bind(NS)('settings.nav'),
      locale: NS,
    },
    SettingsSection,
  ))
}
