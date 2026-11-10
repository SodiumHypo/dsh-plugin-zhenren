/**
 * Corpus invariants and the query contract (CLAUDE.md §3.4, §3.5, §3.8).
 *
 * These run against the shipped `data/oracle.json`, not a fixture: a broken
 * extraction must fail the suite before it can ship.
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadOracleIndex } from '../src/data/load.js'
import { lookupOracle, normalizeQuery, splitHanCharacters } from '../src/data/lookup.js'

const dataDir = fileURLToPath(new URL('../data', import.meta.url))
const index = loadOracleIndex({ dataDir })

describe('shipped corpus', () => {
  it('ships 1,425 glyphs, 1,181 headwords and 627 aliases', () => {
    expect(index.glyphs.size).toBe(1425)
    expect(index.headwords.size).toBe(1181)
    expect(index.aliases.size).toBe(627)
    expect(index.supportedCount).toBe(1425)
    expect(index.counts.glyphs).toBe(1425)
    expect(index.counts.glossedGlyphs).toBe(1202)
    expect(index.counts.glyphOnly).toBe(223)
  })

  it('never leaves a glyph pointing at a missing headword', () => {
    const dangling: string[] = []
    for (const [char, record] of index.glyphs) {
      if (record.headword !== null && !index.headwords.has(record.headword)) {
        dangling.push(`${char} → ${record.headword}`)
      }
    }
    expect(dangling).toEqual([])
  })

  it('keeps every alias disjoint from the glyph set', () => {
    const overlapping = [...index.aliases.keys()].filter((key) => index.glyphs.has(key))
    expect(overlapping).toEqual([])
  })

  it('shares 说文 headwords without duplicating the gloss', () => {
    const shared = [...index.headwords.values()].filter((record) => record.glyphChars.length > 1)
    expect(shared.length).toBe(21)
    const ming = index.headwords.get('朙')
    expect(ming?.glyphChars.length).toBe(2)
    expect(ming?.glyphChars).toEqual(expect.arrayContaining(['明', '朙']))
  })

  it('excludes phonology fields and keeps 说文 originals non-empty', () => {
    const raw = JSON.parse(
      fs.readFileSync(new URL('../data/oracle.json', import.meta.url), 'utf8'),
    ) as { headwords: Record<string, Record<string, unknown>> }
    const violations: string[] = []
    for (const [headword, record] of Object.entries(raw.headwords)) {
      if ('mc' in record || 'pos' in record || 'oc' in record || 'ocsrc' in record) {
        violations.push(`${headword}: phonology field leaked`)
      }
      const shuowen = record.shuowen as { original?: string } | null
      if (shuowen === null || typeof shuowen?.original !== 'string' || shuowen.original.length === 0) {
        violations.push(`${headword}: empty original`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('query contract', () => {
  it('matches the exact glyph before the alias layer', () => {
    const ming = lookupOracle(index, '明')
    expect(ming.found && ming.glyphChar).toBe('明')
    expect(ming.found && ming.headword).toBe('朙')
    expect(ming.found && ming.matchedBy).toBe('glyph')

    const alternate = lookupOracle(index, '朙')
    expect(alternate.found && alternate.glyphChar).toBe('朙')
    expect(alternate.found && alternate.headword).toBe('朙')
  })

  it('normalizes a character without its own glyph through the alias layer', () => {
    const zhen = lookupOracle(index, '贞')
    expect(zhen.found).toBe(true)
    if (!zhen.found) return
    expect(zhen.glyphChar).toBe('貞')
    expect(zhen.normalized).toBe('貞')
    expect(zhen.query).toBe('贞')
    expect(zhen.matchedBy).toBe('alias')
    expect(zhen.shuowen).not.toBeNull()
  })

  it('separates "has a glyph" from "has a 说文 gloss"', () => {
    const qi = lookupOracle(index, '其')
    expect(qi.found).toBe(true)
    if (!qi.found) return
    expect(qi.glyphChar).toBe('其')
    expect(qi.headword).toBeNull()
    expect(qi.shuowen).toBeNull()
  })

  it('reports a miss without guessing at a near match', () => {
    const miss = lookupOracle(index, '龘')
    expect(miss.found).toBe(false)
    if (miss.found) return
    expect(miss.reason).toBe('not-in-oracle-corpus')
    expect(miss.supportedCount).toBe(1425)
    expect(miss.normalized).toBe('龘')
  })

  it('rejects a query with no Han character', () => {
    const empty = lookupOracle(index, ' ？!')
    expect(empty.found).toBe(false)
    if (empty.found) return
    expect(empty.reason).toBe('empty-query')
  })

  it('cleans whitespace and zero-width characters before matching', () => {
    const zwsp = String.fromCharCode(0x200b)
    expect(normalizeQuery(`${zwsp} 贞 ${zwsp}`).char).toBe('贞')
    expect(normalizeQuery('abc').char).toBeNull()
  })

  it('splits free text into carvable Han characters', () => {
    expect(splitHanCharacters('贞：今其出，亡咎？')).toEqual(['贞', '今', '其', '出', '亡', '咎'])
    expect(splitHanCharacters('「卜」')).toEqual(['卜'])
  })
})
