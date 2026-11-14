/**
 * `zhenren_lookup` contract (CLAUDE.md §4.13, D21) and its meta parser.
 *
 * The science query is independent of the ritual: no divinationId, no auspice.
 * These tests pin the honesty boundaries (found ≠ gloss, no near-match guessing)
 * and the F2 delivery rule — the inline PUA must appear in `render`, because dsh
 * hands the model the render content, not the raw value.
 */
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseLookupMeta, type LookupPresentationMeta } from '../src/contract.js'
import { loadOracleIndex, type OracleIndex } from '../src/data/load.js'
import { createLookupTool } from '../src/tools/lookup.js'

const dataDir = fileURLToPath(new URL('../data', import.meta.url))
const index: OracleIndex = loadOracleIndex({ dataDir })
const EXEC = {} as never

interface FoundValue {
  found: true
  query: string
  normalized: string
  glyphChar: string
  glyphSource: 'font' | 'image'
  headword: string | null
  pinyin: string | null
  shuowen: {
    original: string
    vernacular: string
    vernacularStatus: string
    correction: { text: string; source: string } | null
  } | null
  inline: string | null
  evolution: { stages: Array<{ name: string; note: string }>; status: string } | null
  matchedBy: 'glyph' | 'alias'
  sources: unknown[]
  supportedCount: number
  attribution: string
}

interface MissValue {
  found: false
  query: string
  normalized: string
  reason: string
  supportedCount: number
  attribution: string
}

type LookupValue = FoundValue | MissValue

function tool() {
  return createLookupTool({ getIndex: () => index })
}

async function lookup(char: string): Promise<LookupValue> {
  return (await tool().execute({ char }, EXEC)) as LookupValue
}

function renderText(value: LookupValue): string {
  const blocks = tool().output.render({} as never, value as never) as Array<{ type: string; text: string }>
  return blocks.map((block) => block.text).join('\n')
}

function metaOf(value: LookupValue): LookupPresentationMeta {
  return tool().output.presentationMeta?.({} as never, value as never) as LookupPresentationMeta
}

/** A single private-use codepoint (U+E000–U+F8FF), the inline contract. */
function isPua(value: string | null): boolean {
  if (value === null || value.length !== 1) return false
  const code = value.codePointAt(0)
  return code !== undefined && code >= 0xe000 && code <= 0xf8ff
}

describe('zhenren_lookup', () => {
  it('resolves a font glyph to its 说文 headword and inline PUA', async () => {
    const value = await lookup('明')
    expect(value.found).toBe(true)
    if (!value.found) return
    expect(value.glyphChar).toBe('明')
    expect(value.headword).toBe('朙')
    expect(value.glyphSource).toBe('font')
    expect(value.matchedBy).toBe('glyph')
    expect(value.shuowen).not.toBeNull()
    expect(isPua(value.inline)).toBe(true)
    expect(value.supportedCount).toBe(index.supportedCount)
    expect(value.attribution).toContain('OFL-1.1')
  })

  it('keeps found separate from gloss for a glyph-only character', async () => {
    const value = await lookup('其')
    expect(value.found).toBe(true)
    if (!value.found) return
    // Has a glyph and an inline codepoint, but no 说文 headword.
    expect(value.headword).toBeNull()
    expect(value.shuowen).toBeNull()
    expect(value.evolution).toBeNull()
    expect(isPua(value.inline)).toBe(true)
  })

  it('returns an image glyph with its rendering source', async () => {
    const value = await lookup('福')
    expect(value.found).toBe(true)
    if (!value.found) return
    expect(value.glyphSource).toBe('image')
    expect(value.headword).toBe('福')
    expect(value.sources.some((s) => (s as { value: string }).value.includes('HUST-OBC'))).toBe(true)
  })

  it('normalizes an alias to its corpus glyph without rewriting the query', async () => {
    const value = await lookup('贞')
    expect(value.found).toBe(true)
    if (!value.found) return
    expect(value.query).toBe('贞')
    expect(value.glyphChar).toBe('貞')
    expect(value.normalized).toBe('貞')
    expect(value.matchedBy).toBe('alias')
  })

  it('reports a character outside the corpus without guessing a near match', async () => {
    const value = await lookup('龘')
    expect(value.found).toBe(false)
    if (value.found) return
    expect(value.reason).toBe('not-in-oracle-corpus')
    expect(value.supportedCount).toBe(index.supportedCount)
  })

  it('reports an empty query when the input has no Han character', async () => {
    const value = await lookup('abc?!')
    expect(value.found).toBe(false)
    if (value.found) return
    expect(value.reason).toBe('empty-query')
  })

  it('rejects multi-character input instead of silently picking one', async () => {
    await expect(lookup('明月')).rejects.toThrow(/多字/)
  })
})

describe('zhenren_lookup render (model-visible)', () => {
  it('carries the inline PUA and a modern annotation the model can copy', async () => {
    const value = await lookup('明')
    expect(value.found).toBe(true)
    if (!value.found) return
    const text = renderText(value)
    // D21: the PUA char must be in render — it is the model's only copy source.
    expect(value.inline).not.toBeNull()
    expect(text).toContain(value.inline as string)
    expect(text).toContain('（明）')
    expect(text).toContain('朙')
    expect(text).toContain('《说文》')
  })

  it('says 《说文》未收此形 for a glyph-only character', async () => {
    const value = await lookup('其')
    const text = renderText(value)
    expect(text).toContain('《说文》未收此形')
    expect(text).toContain('资料整理中')
  })

  it('states the corpus boundary for a miss', async () => {
    const value = await lookup('龘')
    const text = renderText(value)
    expect(text).toContain('不在甲骨字形库内')
    expect(text).toContain(String(index.supportedCount))
  })
})

describe('zhenren_lookup presentationMeta', () => {
  it('projects a found value into a replayable meta', async () => {
    const value = await lookup('明')
    expect(value.found).toBe(true)
    if (!value.found) return
    const meta = metaOf(value)
    expect(meta.version).toBe(1)
    expect(meta.kind).toBe('zhenren.lookup')
    expect(meta.found).toBe(true)
    expect(meta.glyphChar).toBe('明')
    expect(meta.inline).toBe(value.inline)
    expect(meta.original).toBe(value.shuowen?.original ?? null)
    const parsed = parseLookupMeta(meta)
    expect(parsed).not.toBeNull()
    expect(parsed?.glyphChar).toBe('明')
    expect(parsed?.inline).toBe(value.inline)
  })

  it('projects a miss with null glyph fields', async () => {
    const value = await lookup('龘')
    const meta = metaOf(value)
    expect(meta.found).toBe(false)
    expect(meta.glyphChar).toBeNull()
    expect(meta.reason).toBe('not-in-oracle-corpus')
    expect(parseLookupMeta(meta)?.found).toBe(false)
  })

  it('is a pure projection: the same value yields the same meta', async () => {
    const value = await lookup('福')
    expect(metaOf(value)).toEqual(metaOf(value))
  })
})

describe('parseLookupMeta degradation', () => {
  it('rejects an unknown version or wrong kind', async () => {
    const meta = metaOf(await lookup('明'))
    expect(parseLookupMeta({ ...meta, version: 99 })).toBeNull()
    expect(parseLookupMeta({ ...meta, kind: 'zhenren.burn' })).toBeNull()
  })

  it('rejects a found meta missing its glyphChar or with a bad source', async () => {
    const meta = metaOf(await lookup('明'))
    expect(parseLookupMeta({ ...meta, glyphChar: null })).toBeNull()
    expect(parseLookupMeta({ ...meta, glyphSource: 'svg' })).toBeNull()
  })

  it('degrades a non-PUA inline to null without rejecting the card', async () => {
    const meta = metaOf(await lookup('明'))
    const parsed = parseLookupMeta({ ...meta, inline: '明' })
    expect(parsed).not.toBeNull()
    expect(parsed?.found).toBe(true)
    expect(parsed?.inline).toBeNull()
  })

  it('degrades a malformed evolution to null', async () => {
    const meta = metaOf(await lookup('明'))
    const parsed = parseLookupMeta({ ...meta, evolution: { stages: [], status: 'draft' } })
    expect(parsed).not.toBeNull()
    expect(parsed?.evolution).toBeNull()
  })

  it('returns null for non-objects', () => {
    expect(parseLookupMeta(null)).toBeNull()
    expect(parseLookupMeta(undefined)).toBeNull()
    expect(parseLookupMeta('zhenren.lookup')).toBeNull()
    expect(parseLookupMeta(42)).toBeNull()
  })
})