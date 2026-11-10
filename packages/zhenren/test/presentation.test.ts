/**
 * presentationMeta is the animation handle persisted with each result
 * (CLAUDE.md §4.4, §4.5, §5.9).
 *
 * It must be pure, JSON-serializable, self-contained, and identical to what a
 * replay would regenerate — otherwise a restored session draws a different
 * omen than the one that was read.
 */
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTION,
  parseBurnMeta,
  parseCrackSpec,
  parseInscribeMeta,
} from '../src/contract.js'
import { resolveConfig } from '../src/config.js'
import { loadOracleIndex, type OracleIndex } from '../src/data/load.js'
import { generateCracks } from '../src/ritual/crack.js'
import { createBurnTool } from '../src/tools/burn.js'
import { createInscribeTool } from '../src/tools/inscribe.js'
import { createDivinationMemory } from '../src/tools/shared.js'

const dataDir = fileURLToPath(new URL('../data', import.meta.url))
const index: OracleIndex = loadOracleIndex({ dataDir })

const EXEC = {} as never
const CONFIG = resolveConfig()

interface BurnValue {
  divinationId: string
  seed: string
  charge: string
  question: string
  auspice: '吉' | '凶' | '中性'
  burnPoint: { x: number; y: number }
}

interface InscribeValue {
  ok: boolean
  glyphs: Array<{ char: string; slot: number; found: boolean }>
}

describe('burn presentationMeta', () => {
  it('is pure, complete and replayable', async () => {
    const args = { question: '近期是否适合出行？', charge: '贞：今其出，亡咎？', seed: 'meta-burn' }
    const tool = createBurnTool({ getIndex: () => index, config: CONFIG, memory: createDivinationMemory() })
    const value = (await tool.execute(args, EXEC)) as unknown as BurnValue
    const raw = tool.output.presentationMeta?.(args, value as never)
    expect(raw).toBeDefined()
    if (raw === undefined) return

    const meta = parseBurnMeta(raw)
    expect(meta).not.toBeNull()
    if (meta === null) return
    expect(meta.divinationId).toBe(value.divinationId)
    expect(meta.seed).toBe('meta-burn')
    expect(meta.auspice).toBe(value.auspice)
    expect(meta.burnPoint).toEqual(value.burnPoint)
    expect(meta.shellSeed).toBe('shell-meta-burn')
    expect(meta.animation).toBe('full')
    expect(meta.showShuowen).toBe(true)
    expect(meta.locale).toBe('zh-CN')
    expect(meta.attribution).toBe(ATTRIBUTION)
    expect(meta.cracks).toEqual(
      generateCracks({ seed: value.seed, auspice: value.auspice, burnPoint: value.burnPoint }),
    )

    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw)
    expect(raw).not.toHaveProperty('chargeGlyphs')
    expect(raw).not.toHaveProperty('reading')
    expect(raw).not.toHaveProperty('missing')
  })

  it('rejects metas the client cannot draw', async () => {
    const tool = createBurnTool({ getIndex: () => index, config: CONFIG, memory: createDivinationMemory() })
    const args = { question: 'q', charge: '贞', seed: 'meta-bad' }
    const value = (await tool.execute(args, EXEC)) as unknown as BurnValue
    const raw = tool.output.presentationMeta?.(args, value as never) as Record<string, unknown>
    expect(parseBurnMeta(null)).toBeNull()
    expect(parseBurnMeta({ ...raw, version: 2 })).toBeNull()
    expect(parseBurnMeta({ ...raw, cracks: null })).toBeNull()
    expect(parseBurnMeta({ ...raw, burnPoint: { x: 1.5, y: 0.5 } })).toBeNull()
    expect(parseCrackSpec({ ...(raw.cracks as object), version: 2 })).toBeNull()
    const outside = JSON.parse(JSON.stringify(raw.cracks)) as {
      main: { points: number[][] }
    }
    outside.main.points[0] = [2, 0.5]
    expect(parseCrackSpec(outside)).toBeNull()
  })
})

describe('inscribe presentationMeta', () => {
  it('carries one slot per glyph and one carve step per slot', async () => {
    const memory = createDivinationMemory()
    const burned = (await createBurnTool({
      getIndex: () => index,
      config: CONFIG,
      memory,
    }).execute({ question: 'q', charge: '贞：今其出，亡咎？', seed: 'meta-inscribe' }, EXEC)) as unknown as BurnValue

    const args = {
      divinationId: burned.divinationId,
      burnSeed: burned.seed,
      inscription: { prefix: '贞：', charge: '今其出，亡咎？', prognosis: '其吉，亡咎。' },
      highlight: ['咎'],
      layout: { columns: 2 },
    }
    const tool = createInscribeTool({ getIndex: () => index, config: CONFIG, memory })
    const value = (await tool.execute(args, EXEC)) as unknown as InscribeValue
    expect(value.ok).toBe(true)

    const raw = tool.output.presentationMeta?.(args, value as never)
    if (raw === undefined) {
      throw new Error('inscribe presentationMeta missing')
    }
    const meta = parseInscribeMeta(raw)
    expect(meta).not.toBeNull()
    if (meta === null) return

    expect(meta.ok).toBe(true)
    expect(meta.burnSeed).toBe(burned.seed)
    expect(meta.auspice).toBe(burned.auspice)
    expect(meta.glyphs.length).toBe(value.glyphs.length)
    expect(meta.layout.slots.length).toBe(value.glyphs.length)
    expect(meta.carve.chars.length).toBe(value.glyphs.length)
    expect(meta.layout.columns).toBe(2)
    expect(meta.layout.direction).toBe('rtl')
    expect(meta.cracks).toEqual(
      generateCracks({
        seed: burned.seed,
        auspice: burned.auspice,
        burnPoint: burned.burnPoint,
      }),
    )

    const zhen = meta.glyphs.find((glyph) => glyph.char === '贞')
    expect(zhen?.glyphChar).toBe('貞')
    expect(zhen?.found).toBe(true)

    expect(meta.highlightGlosses.map((gloss) => gloss.char)).toEqual(['咎'])
    expect(meta.highlightGlosses[0]?.original.length).toBeGreaterThan(0)

    for (const step of meta.carve.chars) {
      expect(Number.isInteger(step.maskSeed)).toBe(true)
      expect(step.pressure).toBeGreaterThanOrEqual(0.55)
      expect(step.pressure).toBeLessThanOrEqual(1)
    }
    expect(JSON.parse(JSON.stringify(raw))).toEqual(raw)
  })

  it('marks a missing character as a 空刻 in meta', async () => {
    const args = {
      divinationId: 'div_abcdef',
      burnSeed: 'meta-placeholder',
      inscription: { charge: '今龘出', prognosis: '吉' },
    }
    const tool = createInscribeTool({ getIndex: () => index, config: CONFIG, memory: createDivinationMemory() })
    const value = (await tool.execute(args, EXEC)) as unknown as InscribeValue
    const meta = parseInscribeMeta(tool.output.presentationMeta?.(args, value as never))
    expect(meta).not.toBeNull()
    if (meta === null) return
    const placeholder = meta.glyphs.find((glyph) => glyph.char === '龘')
    expect(placeholder).toEqual({
      slot: placeholder?.slot,
      char: '龘',
      found: false,
      glyphChar: null,
      placeholder: true,
    })
    expect(meta.auspice).toBeNull()
    expect(meta.cracks).toBeNull()
  })

  it('degrades malformed metas instead of throwing', () => {
    expect(parseInscribeMeta(null)).toBeNull()
    expect(parseInscribeMeta({ version: 1, kind: 'zhenren.inscribe' })).toBeNull()

    const minimal = {
      version: 1,
      kind: 'zhenren.inscribe',
      divinationId: 'div_abcdef',
      burnSeed: 'seed',
      glyphs: [{ slot: 0, char: '贞', found: false, glyphChar: null }],
      layout: { columns: 1, direction: 'rtl', slots: [] },
      carve: { version: 1, chars: [] },
      highlightGlosses: [],
      attribution: 'x',
    }
    const parsed = parseInscribeMeta(minimal)
    expect(parsed?.glyphs[0]?.placeholder).toBe(true)
    expect(parsed?.animation).toBe('full')
    expect(parsed?.showShuowen).toBe(true)

    const badSlot = {
      ...minimal,
      layout: {
        columns: 1,
        direction: 'rtl',
        slots: [{ index: 0, column: 0, row: 0, x: 1.5, y: 0.5, size: 0.1 }],
      },
    }
    expect(parseInscribeMeta(badSlot)).toBeNull()
  })
})
