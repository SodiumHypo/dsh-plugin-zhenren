/**
 * Static render tests for both cards (CLAUDE.md §4.8, §4.12, §5.7).
 *
 * `renderToStaticMarkup` runs the components without a DOM, so these assert
 * the part that must survive every failure mode: readable text, an accessible
 * canvas, and a fallback when the meta is missing.
 */
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { loadOracleIndex } from '../src/data/load.js'
import { createBurnTool } from '../src/tools/burn.js'
import { createInscribeTool } from '../src/tools/inscribe.js'
import { createDivinationMemory } from '../src/tools/shared.js'
import { BurnRow } from '../src/client/views/BurnRow.js'
import { InscribeRow } from '../src/client/views/InscribeRow.js'
import { SettingsSection } from '../src/client/views/SettingsSection.js'

const dataDir = fileURLToPath(new URL('../data', import.meta.url))
const index = loadOracleIndex({ dataDir })
const CONFIG = resolveConfig()
const EXEC = {} as never

type AnyComponent = ComponentType<Record<string, unknown>>
type AnyProps = Record<string, unknown>

const Burn = BurnRow as unknown as AnyComponent
const Inscribe = InscribeRow as unknown as AnyComponent
const t = (key: string): string => key

function render(component: AnyComponent, props: AnyProps): string {
  return renderToStaticMarkup(createElement(component, props))
}

function resultBlock(meta: unknown): AnyProps {
  return { kind: 'tool-result', content: [], isError: false, meta }
}

function errorBlock(name: string, code: string): AnyProps {
  return { kind: 'tool-result', content: [], isError: true, error: { name, code } }
}

const INSCRIBE_ARGS = {
  divinationId: 'div_abcdef',
  burnSeed: 'render-seed',
  inscription: { prefix: '贞：', charge: '今其出，亡咎？', prognosis: '其吉，亡咎。' },
  highlight: ['咎'],
}

async function burnMeta(args: Record<string, unknown> = {
  question: '近期是否适合出行？',
  charge: '贞：今其出，亡咎？',
  seed: 'render-seed',
}): Promise<unknown> {
  const tool = createBurnTool({
    getIndex: () => index,
    config: CONFIG,
    memory: createDivinationMemory(),
  })
  const value = await tool.execute(args, EXEC)
  return tool.output.presentationMeta?.(args, value as never)
}

async function inscribeMeta(args: Record<string, unknown> = INSCRIBE_ARGS): Promise<unknown> {
  const tool = createInscribeTool({
    getIndex: () => index,
    config: CONFIG,
    memory: createDivinationMemory(),
  })
  const value = await tool.execute(args, EXEC)
  return tool.output.presentationMeta?.(args, value as never)
}

describe('BurnRow', () => {
  it('shows the ritual stage before the result arrives', () => {
    const preparing = render(Burn, { phase: 'preparing', t })
    expect(preparing).toContain('data-state="preparing"')
    expect(preparing).toContain('burn.preparing')

    const waiting = render(Burn, { phase: 'start', block: {}, t })
    expect(waiting).toContain('data-state="waiting"')
    expect(waiting).toContain('burn.waiting')
  })

  it('renders question, charge and omen in the result phase (license attribution omitted)', async () => {
    const meta = await burnMeta()
    const markup = render(Burn, { phase: 'result', block: resultBlock(meta), t })
    expect(markup).toContain('data-state="ok"')
    expect(markup).toContain('burn.question')
    expect(markup).toContain('近期是否适合出行？')
    expect(markup).toContain('贞：今其出，亡咎？')
    // License/copyright attribution lives in README/LICENSE only, not the card.
    expect(markup).not.toContain('OFL-1.1')
    expect(markup).toContain('card.boundary')
    expect(markup).toContain('card.corpus')
    expect(markup).toContain('<canvas')
    expect(markup).toContain('aria-label=')
    expect(markup).toContain('card.skip')
    expect(markup).toContain('card.replay')
  })

  it('falls back to text when the meta is missing or malformed', () => {
    const missing = render(Burn, { phase: 'result', block: resultBlock(null), t })
    expect(missing).toContain('burn.noMeta')

    const malformed = render(Burn, { phase: 'result', block: resultBlock({ version: 1 }), t })
    expect(malformed).toContain('burn.noMeta')
  })

  it('surfaces a tool error as readable text', () => {
    const markup = render(Burn, {
      phase: 'result',
      block: errorBlock('DataUnavailable', 'data-unavailable'),
      t,
    })
    expect(markup).toContain('data-state="error"')
    expect(markup).toContain('DataUnavailable: data-unavailable')
  })

  it('hides the animation controls when animation is off', async () => {
    const tool = createBurnTool({
      getIndex: () => index,
      config: resolveConfig({ animation: 'off' }),
      memory: createDivinationMemory(),
    })
    const args = { question: 'q', charge: '贞', seed: 'render-off' }
    const value = await tool.execute(args, EXEC)
    const meta = tool.output.presentationMeta?.(args, value as never)
    const markup = render(Burn, { phase: 'result', block: resultBlock(meta), t })
    expect(markup).not.toContain('card.skip')
    expect(markup).not.toContain('card.replay')
  })
})

describe('InscribeRow', () => {
  it('shows the ritual stage before the result arrives', () => {
    const markup = render(Inscribe, { phase: 'preparing', t })
    expect(markup).toContain('data-state="preparing"')
    expect(markup).toContain('inscribe.preparing')
  })

  it('renders the transcription, the shared omen and the gloss', async () => {
    const meta = await inscribeMeta()
    const markup = render(Inscribe, { phase: 'result', block: resultBlock(meta), t })
    expect(markup).toContain('data-state="ok"')
    expect(markup).toContain('贞今其出亡咎其吉亡咎')
    expect(markup).toContain('gloss.title')
    expect(markup).not.toContain('OFL-1.1')
    expect(markup).toContain('<canvas')
    expect(markup).toContain('card.skip')
  })

  it('renders 空刻 for characters outside the corpus', async () => {
    const meta = await inscribeMeta({
      ...INSCRIBE_ARGS,
      inscription: { charge: '今龘出', prognosis: '吉' },
    })
    const markup = render(Inscribe, { phase: 'result', block: resultBlock(meta), t })
    expect(markup).toContain('□')
    expect(markup).toContain('inscribe.placeholder')
  })

  it('falls back to text for a malformed meta or failed call', () => {
    const malformed = render(Inscribe, { phase: 'result', block: resultBlock({}), t })
    expect(malformed).toContain('inscribe.empty')

    const failed = render(Inscribe, {
      phase: 'result',
      block: errorBlock('ToolError', 'invalid-arguments'),
      t,
    })
    expect(failed).toContain('data-state="error"')
    expect(failed).toContain('ToolError: invalid-arguments')
  })
})

describe('SettingsSection', () => {
  const Settings = SettingsSection as unknown as AnyComponent

  it('renders the dedicated settings page with its controls (D27)', () => {
    const markup = render(Settings, { t, close: () => {} })
    expect(markup).toContain('data-settings="zhenren"')
    expect(markup).toContain('settings.title')
    expect(markup).toContain('id="zhenren-update-check"')
    expect(markup).toContain('id="zhenren-registry"')
    expect(markup).toContain('settings.clear')
  })
})
