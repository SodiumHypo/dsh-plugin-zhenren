/**
 * Tool behaviour at the protocol boundary (CLAUDE.md §4.4, §4.5, §4.12).
 *
 * These call `tool.execute` directly, which is also where dsh validates the
 * parameter schema, so rejection paths are exercised the way the model sees
 * them.
 */
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Auspice, OmenReading } from '../src/contract.js'
import type { ShuowenGloss } from '../src/data/schema.js'
import { resolveConfig, type Config } from '../src/config.js'
import { loadOracleIndex, type OracleIndex } from '../src/data/load.js'
import { splitHanCharacters } from '../src/data/lookup.js'
import { createBurnTool } from '../src/tools/burn.js'
import { createInscribeTool } from '../src/tools/inscribe.js'
import { createDivinationMemory, isDivinationId } from '../src/tools/shared.js'
import { canonicalPrefix } from '../src/ritual/ganzhi.js'

const dataDir = fileURLToPath(new URL('../data', import.meta.url))
const index: OracleIndex = loadOracleIndex({ dataDir })

interface BurnValue {
  divinationId: string
  seed: string
  question: string
  charge: string
  dayGanzhi: string
  prefix: string
  auspice: Auspice
  reading: OmenReading
  burnPoint: { x: number; y: number }
  chargeGlyphs: Array<{
    char: string
    found: boolean
    headword?: string | null
    glyphChar?: string
    glossFound?: boolean
  }>
  missing: string[]
  attribution: string
}

interface InscribeGlyph {
  slot: number
  char: string
  found: boolean
  glossFound: boolean
  headword?: string | null
  glyphChar?: string | null
  shuowen?: ShuowenGloss | null
  placeholder?: boolean
  reason?: string
}

interface InscribeValue {
  ok: boolean
  divinationId: string | null
  prefix: string
  missing: string[]
  glyphs: InscribeGlyph[]
  layoutSummary: string
  warnings: string[]
  error: string | null
  continuity: { auspice: Auspice; burnPoint: { x: number; y: number } } | null
  attribution: string
}

const EXEC = {} as never

/** Glyphs drop the punctuation in the 前辞; compare Han characters only. */
function hanOnly(text: string): string {
  return splitHanCharacters(text).join('')
}

function burnTool(config: Config = {}) {
  return createBurnTool({ getIndex: () => index, config: resolveConfig(config), memory: createDivinationMemory() })
}

function inscribeTool(config: Config = {}, memory = createDivinationMemory()) {
  return createInscribeTool({ getIndex: () => index, config: resolveConfig(config), memory })
}

async function burn(args: Record<string, unknown>): Promise<BurnValue> {
  return (await burnTool().execute(args, EXEC)) as BurnValue
}

async function inscribe(
  args: Record<string, unknown>,
  config: Config = {},
  memory = createDivinationMemory(),
): Promise<InscribeValue> {
  return (await inscribeTool(config, memory).execute(args, EXEC)) as InscribeValue
}

const CHARGE = '贞：今其出，亡咎？'

describe('zhenren_burn', () => {
  it('returns one authoritative omen and the 命辞 glyph report', async () => {
    const tool = burnTool()
    const value = (await tool.execute(
      { question: '近期是否适合出行？', charge: CHARGE, seed: 'seed-a' },
      EXEC,
    )) as BurnValue
    expect(isDivinationId(value.divinationId)).toBe(true)
    expect(value.seed).toBe('seed-a')
    expect(['吉', '凶', '中性']).toContain(value.auspice)
    expect(value.charge).toBe(CHARGE)
    expect(value.chargeGlyphs.map((glyph) => glyph.char)).toEqual(['贞', '今', '其', '出', '亡', '咎'])
    expect(value.chargeGlyphs.every((glyph) => glyph.found)).toBe(true)
    expect(value.missing).toEqual([])
    expect(value.burnPoint.x).toBeGreaterThanOrEqual(0)
    expect(value.burnPoint.x).toBeLessThanOrEqual(1)
    expect(value.prefix).toBe(canonicalPrefix(new Date(), '鱼'))
    expect(value.prefix).toMatch(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]卜，鱼贞：$/)
    expect(value.attribution).toContain('OFL-1.1')
    // The model only sees `render`; it must carry the join keys for inscribe.
    const rendered = (tool.output.render({} as never, value as never) as { type: string; text: string }[])
      .map((block) => block.text)
      .join('\n')
    expect(rendered).toContain(value.divinationId)
    expect(rendered).toContain(value.seed)
    expect(rendered).toContain(value.prefix)
  })

  it('replays the omen for the same seed', async () => {
    const first = await burn({ question: 'q', charge: CHARGE, seed: 'seed-b' })
    const second = await burn({ question: 'q', charge: CHARGE, seed: 'seed-b' })
    expect(second.auspice).toBe(first.auspice)
    expect(second.burnPoint).toEqual(first.burnPoint)
    expect(second.reading).toEqual(first.reading)
    expect(second.divinationId).not.toBe(first.divinationId)
  })

  it('keeps characters outside the corpus as missing, not as errors', async () => {
    const value = await burn({ question: 'q', charge: '贞：龘其出？', seed: 'seed-c' })
    expect(value.missing).toEqual(['龘'])
    const placeholder = value.chargeGlyphs.find((glyph) => glyph.char === '龘')
    expect(placeholder?.found).toBe(false)
    expect(placeholder?.glyphChar).toBeUndefined()
  })

  it('clamps a burn-point hint to the 甲面', async () => {
    const value = await burn({
      question: 'q',
      charge: '贞',
      seed: 'seed-d',
      burnPoint: { x: -5, y: 9 },
    })
    expect(value.burnPoint.x).toBeGreaterThanOrEqual(0.14)
    expect(value.burnPoint.x).toBeLessThanOrEqual(0.86)
    expect(value.burnPoint.y).toBeGreaterThanOrEqual(0.14)
    expect(value.burnPoint.y).toBeLessThanOrEqual(0.86)
  })

  it('rejects an empty or overlong 命辞 instead of truncating', async () => {
    await expect(burn({ question: 'q', charge: '   ' })).rejects.toThrow(/不能为空/)
    await expect(burn({ question: 'q', charge: '？!' })).rejects.toThrow(/至少需要一个汉字/)
    await expect(burn({ question: 'q', charge: '甲'.repeat(25) })).rejects.toThrow(/超过上限 24/)
  })

  it('rejects a malformed replay seed', async () => {
    await expect(burn({ question: 'q', charge: '贞', seed: 'bad seed' })).rejects.toThrow(/seed/)
  })
})

describe('zhenren_inscribe', () => {
  it('carves an inscription and reports the three-part text', async () => {
    const value = await inscribe({
      divinationId: 'div_abcdef',
      burnSeed: 'seed-e',
      inscription: { prefix: '贞：', charge: '今其出', prognosis: '其吉。' },
    })
    expect(value.ok).toBe(true)
    expect(value.error).toBeNull()
    expect(value.prefix).toBe(canonicalPrefix(new Date(), '鱼'))
    // The model-supplied `prefix` is ignored; the host opening comes first.
    expect(value.glyphs.map((glyph) => glyph.char).join('')).toBe(`${hanOnly(value.prefix)}今其出其吉`)
    expect(value.glyphs.map((glyph) => glyph.char).slice(-5)).toEqual(['今', '其', '出', '其', '吉'])
    expect(value.glyphs.map((glyph) => glyph.slot)).toEqual(value.glyphs.map((_, index) => index))
    expect(value.layoutSummary).toMatch(/right-to-left/)
    expect(value.warnings.length).toBe(1)
    expect(value.continuity).toBeNull()
  })

  it('lets the model choose the column direction', async () => {
    const base = {
      divinationId: 'div_abcdef',
      burnSeed: 'seed-direction',
      inscription: { charge: '今其出', prognosis: '其吉。' },
    }
    const ltr = await inscribe({ ...base, layout: { columns: 2, direction: 'ltr' } })
    const rtl = await inscribe({ ...base, layout: { columns: 2, direction: 'rtl' } })
    expect(ltr.layoutSummary).toMatch(/left-to-right/)
    expect(rtl.layoutSummary).toMatch(/right-to-left/)

    const tool = inscribeTool()
    const metaOf = (args: Record<string, unknown>, value: InscribeValue) => {
      return tool.output.presentationMeta?.(args as never, value as never) as {
        layout: { direction: 'ltr' | 'rtl'; slots: Array<{ x: number }> }
      }
    }
    const ltrMeta = metaOf({ ...base, layout: { columns: 2, direction: 'ltr' } }, ltr)
    const rtlMeta = metaOf({ ...base, layout: { columns: 2, direction: 'rtl' } }, rtl)
    expect(ltrMeta.layout.direction).toBe('ltr')
    expect(rtlMeta.layout.direction).toBe('rtl')
    const ltrX = ltrMeta.layout.slots[0]?.x ?? -1
    const rtlX = rtlMeta.layout.slots[0]?.x ?? -1
    expect(ltrX).toBeGreaterThanOrEqual(0)
    expect(ltrX).toBeLessThan(rtlX)
  })

  it('joins the burn card when the process still remembers the divination', async () => {
    const memory = createDivinationMemory()
    const burned = (await createBurnTool({
      getIndex: () => index,
      config: resolveConfig(),
      memory,
    }).execute({ question: 'q', charge: CHARGE, seed: 'seed-f' }, EXEC)) as BurnValue

    const carved = await inscribe(
      {
        divinationId: burned.divinationId,
        burnSeed: burned.seed,
        inscription: { charge: '今其出', prognosis: '其吉。' },
      },
      {},
      memory,
    )
    expect(carved.ok).toBe(true)
    expect(carved.warnings).toEqual([])
    expect(carved.continuity).toEqual({ auspice: burned.auspice, burnPoint: burned.burnPoint })
  })

  it('warns instead of failing when the burn seed does not match', async () => {
    const memory = createDivinationMemory()
    const burned = (await createBurnTool({
      getIndex: () => index,
      config: resolveConfig(),
      memory,
    }).execute({ question: 'q', charge: '贞', seed: 'seed-g' }, EXEC)) as BurnValue
    const carved = await inscribe(
      {
        divinationId: burned.divinationId,
        burnSeed: 'different-seed',
        inscription: { charge: '贞', prognosis: '吉' },
      },
      {},
      memory,
    )
    expect(carved.ok).toBe(true)
    expect(carved.warnings.length).toBe(1)
    expect(carved.continuity).toBeNull()
  })

  it('returns full 说文 only for highlighted characters', async () => {
    const value = await inscribe({
      divinationId: 'div_abcdef',
      burnSeed: 'seed-h',
      inscription: { charge: '亡咎', prognosis: '吉' },
      highlight: ['咎'],
    })
    expect(value.ok).toBe(true)
    expect(value.glyphs.map((glyph) => glyph.char).join('')).toBe(`${hanOnly(value.prefix)}亡咎吉`)
    const glossed = value.glyphs.filter((glyph) => glyph.shuowen !== null && glyph.shuowen !== undefined)
    expect(glossed.map((glyph) => glyph.char)).toEqual(['咎'])
    expect(glossed[0]?.glossFound).toBe(true)
    for (const glyph of value.glyphs) {
      if (glyph.char !== '咎') expect(glyph.shuowen ?? null).toBeNull()
    }
  })

  it('ignores a model-supplied prefix and fixes the opening', async () => {
    const value = await inscribe({
      divinationId: 'div_abcdef',
      burnSeed: 'seed-l',
      inscription: { prefix: '癸卯卜，某某贞：', charge: '其雨', prognosis: '吉' },
    })
    expect(value.ok).toBe(true)
    expect(value.prefix).toBe(canonicalPrefix(new Date(), '鱼'))
    expect(value.glyphs.map((glyph) => glyph.char).join('')).toBe(`${hanOnly(value.prefix)}其雨吉`)
  })

  it('keeps a 空刻 slot for a character outside the corpus', async () => {
    const value = await inscribe({
      divinationId: 'div_abcdef',
      burnSeed: 'seed-i',
      inscription: { charge: '今龘出', prognosis: '吉' },
    })
    expect(value.ok).toBe(true)
    expect(value.missing).toEqual(['龘'])
    const placeholder = value.glyphs.find((glyph) => glyph.char === '龘')
    expect(placeholder?.found).toBe(false)
    expect(placeholder?.placeholder).toBe(true)
    expect(placeholder?.glyphChar).toBeNull()
    expect(placeholder?.reason).toBe('not-in-oracle-corpus')
    // The model should be told to rewrite next time, not to treat 空刻 as normal.
    expect(value.warnings.some((warning) => warning.includes('空刻'))).toBe(true)
  })

  it('rejects input that cannot be laid out', async () => {
    const value = await inscribe({
      divinationId: 'div_abcdef',
      burnSeed: 'seed-j',
      inscription: { charge: '甲'.repeat(49), prognosis: '' },
    })
    expect(value.ok).toBe(false)
    expect(value.error).toMatch(/超过上限 48/)
  })

  it('rejects a malformed divination id or seed without throwing', async () => {
    const badId = await inscribe({
      divinationId: 'not-an-id',
      burnSeed: 'seed-k',
      inscription: { charge: '贞', prognosis: '吉' },
    })
    expect(badId.ok).toBe(false)
    expect(badId.error).toMatch(/divinationId/)

    const badSeed = await inscribe({
      divinationId: 'div_abcdef',
      burnSeed: 'bad seed',
      inscription: { charge: '贞', prognosis: '吉' },
    })
    expect(badSeed.ok).toBe(false)
    expect(badSeed.error).toMatch(/burnSeed/)
  })
})

describe('divination memory', () => {
  it('evicts the oldest entries and is not authoritative', () => {
    const memory = createDivinationMemory(2)
    const base = {
      seed: 's',
      auspice: '吉' as const,
      burnPoint: { x: 0.5, y: 0.5 },
      question: 'q',
      charge: '贞',
      cracks: { version: 1 as const, main: { points: [], width: 1, breaks: [] }, branches: [], glow: { radius: 0.1, temperature: 0.5, fadeMs: 500 }, bounds: { x: 0, y: 0, w: 1, h: 1 } },
      storedAt: 0,
    }
    memory.set({ ...base, id: 'div_one000' })
    memory.set({ ...base, id: 'div_two000' })
    expect(memory.size).toBe(2)
    memory.set({ ...base, id: 'div_three00' })
    expect(memory.size).toBe(2)
    expect(memory.get('div_one000')).toBeUndefined()
    expect(memory.get('div_three00')).toBeDefined()
  })
})
