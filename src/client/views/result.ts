/**
 * Result-block helpers shared by both cards.
 * Kept aligned with ui-tool's generic row text contract (see ui-skill's
 * `resultText`) so the fallback reads the same as the built-in row.
 */
import type { StartedToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

/** Flatten durable result blocks into plain text, or `null` when empty. */
export function resultText(block: StartedToolCallViewProps['block']): string | null {
  if (!('kind' in block)) return null
  const parts: string[] = []
  for (const item of block.content) {
    parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  }
  if (parts.length === 0 && block.error !== undefined) {
    parts.push(`${block.error.name}: ${block.error.code}`)
  }
  return parts.join('\n') || null
}

/** Whether a settled call ended in a tool error. */
export function resultFailed(block: StartedToolCallViewProps['block']): boolean {
  return 'kind' in block && block.isError
}
