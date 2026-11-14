/**
 * Offline extraction from the yigezi snapshot (`../../.refs/yigezi-main`).
 *
 * Produces the runtime data contract described in CLAUDE.md §3:
 *   data/oracle.json             headwords + glyphs + aliases (schemaVersion 3)
 *   data/manifest.json           counts, source hashes, licenses
 *   data/extraction-report.json  resolution paths, unresolved list, conflicts
 *   data/client-glyphs.json      D23 reduced client dataset (daily glyph + inline)
 *   data/fonts/orac.woff2        byte-identical font copy
 *   data/fonts/OFL.txt           license text (correct Oracular copyright, D25)
 *   data/fonts/THIRD_PARTY_NOTICES.md
 *   data/alias-overrides.json    human-maintained overrides (created empty once)
 *   data/vernacular-overrides.json  human/batch paraphrases (D18; created empty once)
 *   data/evolution-overrides.json   human/batch evolution drafts (D23; created empty once)
 *
 * D17 expansion: when `data/hust-glyphs.json` is present (produced by
 * scripts/expand-hust/build-images.py), its image glyphs are merged into the
 * corpus with `source: "image"` and full provenance. The font layer stays
 * exactly 1,425 glyphs; the total grows by the image count.
 *
 * D21 inline: when `data/inline-map.json` is present (produced by
 * scripts/build-inline-font/build.py), each glyph gets its PUA `inline` char.
 * Absent → all inline:null with a warning; extraction runs independently.
 * The ZhenrenInline derivative font itself is produced by the font script, not here.
 *
 * Build-time only. Never imported by the plugin runtime. Deterministic:
 * the same snapshot plus the same overrides produce the same oracle.json.
 *
 * Usage: node scripts/extract-yigezi/index.mjs [--check]
 *   --check  verify invariants and exit non-zero without writing when they fail
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as OpenCC from 'opencc-js'
import * as fk from 'fontkit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../../..')
const REFS = path.join(ROOT, '.refs', 'yigezi-main')
const OUT = path.resolve(__dirname, '../../data')
const FONT_OUT = path.join(OUT, 'fonts')
const CHECK_ONLY = process.argv.includes('--check')

const SCHEMA_VERSION = 3
/** The font layer is fixed; image glyphs (D17) are added on top of it. */
const EXPECTED_GLYPH_COUNT = 1425
const NON_CHARACTER_CODEPOINTS = new Set([0xffff])
/** Inline PUA range (D21). */
const PUA_START = 0xe000
const PUA_END = 0xf8ff
/** Correct Oracular copyright; the snapshot OFL header is wrong (D25). */
const ORACULAR_COPYRIGHT = 'Copyright (c) Peichao, Qin, 2023. All rights reserved.'
const OFL_MARKER = 'This Font Software is licensed under the SIL Open Font License, Version 1.1.'

/** Sources-only attribution; the boundary sentence is product copy (locale). */
const ATTRIBUTION =
  '字形：Oracular（OFL-1.1）及其改名衍生 ZhenrenInline（OFL-1.1）、HUST-OBC 已释字图像（公有领域，arXiv 2401.15365）。《说文》文本：shuowen.org（Apache-2.0）。数据整理：yigezi（MIT）。'
const BOUNDARY_SUFFIX = '兆纹为艺术化表现，非考古复原。'

// ---------------------------------------------------------------------------
// Source extraction
// ---------------------------------------------------------------------------

/** Read a UTF-8 file. */
function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

/** SHA-256 of a file, hex encoded. */
function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

/**
 * Extract a `NAME={...}` object literal by brace matching, then JSON.parse it.
 * The source literals use double quotes throughout, so JSON.parse is exact.
 */
function extractObject(html, name, searchFrom = 0) {
  const marker = `${name}={`
  const at = html.indexOf(marker, searchFrom)
  if (at < 0) throw new Error(`extract: object ${name} not found`)
  const start = at + marker.length - 1
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return { value: JSON.parse(html.slice(start, i + 1)), end: i }
    }
  }
  throw new Error(`extract: object ${name} is unterminated`)
}

/** Extract a `NAME=`...`` backtick literal. No interpolation occurs in these literals. */
function extractBacktick(html, name) {
  const marker = `${name}=`
  const at = html.indexOf(marker)
  if (at < 0) throw new Error(`extract: backtick ${name} not found`)
  const q = html.indexOf('`', at + marker.length)
  if (q < 0) throw new Error(`extract: opening backtick for ${name} not found`)
  const end = html.indexOf('`', q + 1)
  if (end < 0) throw new Error(`extract: closing backtick for ${name} not found`)
  return html.slice(q + 1, end)
}

/** Parse the five declarations this pipeline consumes from the self-contained page. */
function extractSource(html) {
  const sw = extractObject(html, 'SW')
  const ts = extractObject(html, 'TS', sw.end)
  const xz = extractObject(html, 'XZ')
  const hasOrac = [...new Set(extractBacktick(html, 'HAS_ORAC'))]
  const hasSeal = [...new Set(extractBacktick(html, 'HAS_SEAL'))]
  return { SW: sw.value, TS: ts.value, XZ: xz.value, HAS_ORAC: hasOrac, HAS_SEAL: hasSeal }
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

/** Reverse `SW[*].w` (重文) into char → headwords. */
function buildReverseWIndex(SW) {
  const reverse = new Map()
  for (const [headword, record] of Object.entries(SW)) {
    const w = typeof record.w === 'string' ? record.w : ''
    for (const ch of w) {
      if (!ch.trim()) continue
      let list = reverse.get(ch)
      if (list === undefined) {
        list = []
        reverse.set(ch, list)
      }
      if (!list.includes(headword)) list.push(headword)
    }
  }
  return reverse
}

/** Split a possibly multi-character mapping value into unique characters. */
function charsOf(value) {
  return [...new Set([...value].filter((ch) => ch.trim() !== ''))]
}

/** Codepoint ordering used everywhere for deterministic tie-breaks. */
function byCodepoint(left, right) {
  const a = left.codePointAt(0) ?? 0
  const b = right.codePointAt(0) ?? 0
  return a - b
}

/**
 * Resolve one oracle glyph to its 说文头.
 * Priority: manual headword > exact SW > reverse w > OpenCC s2t > TS.
 * @returns {{headword: string|null, resolvedBy: string, conflicts: string[][]}}
 */
function resolveHeadword(char, ctx, manualHeadwords) {
  const manual = manualHeadwords.get(char)
  if (manual !== undefined && ctx.SW[manual] !== undefined) {
    return { headword: manual, resolvedBy: 'manual-headword', conflicts: [] }
  }
  if (ctx.SW[char] !== undefined) {
    return { headword: char, resolvedBy: 'exact-sw', conflicts: [] }
  }
  const reverse = ctx.reverseW.get(char)
  if (reverse !== undefined && reverse.length > 0) {
    const sorted = [...reverse].sort(byCodepoint)
    return {
      headword: sorted[0],
      resolvedBy: 'reverse-w',
      conflicts: sorted.length > 1 ? [sorted] : [],
    }
  }
  const converted = ctx.s2t(char)
  if (converted !== char) {
    const candidates = charsOf(converted)
    const hit = candidates.find((c) => ctx.SW[c] !== undefined)
    if (hit !== undefined) return { headword: hit, resolvedBy: 'opencc', conflicts: [] }
  }
  const tsCandidates = charsOf(ctx.TS[char] ?? '')
  const tsHit = tsCandidates.find((c) => ctx.SW[c] !== undefined)
  if (tsHit !== undefined) return { headword: tsHit, resolvedBy: 'ts', conflicts: [] }
  return { headword: null, resolvedBy: 'none', conflicts: [] }
}

// ---------------------------------------------------------------------------
// Alias construction
// ---------------------------------------------------------------------------

/** Pick the deterministic rendering glyph for a headword. */
function glyphForHeadword(headword, glyphsByHeadword) {
  const glyphs = glyphsByHeadword.get(headword)
  if (glyphs === undefined || glyphs.length === 0) return undefined
  const exact = glyphs.find((g) => g === headword)
  if (exact !== undefined) return exact
  return [...glyphs].sort(byCodepoint)[0]
}

/**
 * Collect automatic alias proposals. Every source proposes key → glyphChar;
 * a key proposed by more than one distinct target is excluded and reported.
 */
function buildAliases(ctx, glyphToHeadword, glyphsByHeadword, manualAliases) {
  /** @type {Map<string, Map<string, Set<string>>>} */
  const proposals = new Map()
  const propose = (key, target, source) => {
    if (key === target) return
    if (!/^\p{Script=Han}$/u.test(key)) return
    if (!ctx.glyphSet.has(target)) return
    if (ctx.glyphSet.has(key)) return // has its own glyph: runtime resolves it directly
    let targets = proposals.get(key)
    if (targets === undefined) {
      targets = new Map()
      proposals.set(key, targets)
    }
    let sources = targets.get(target)
    if (sources === undefined) {
      sources = new Set()
      targets.set(target, sources)
    }
    sources.add(source)
  }

  // 1. 说文头本身 (when it owns no glyph)
  for (const headword of Object.keys(ctx.SW)) {
    if (ctx.glyphSet.has(headword)) continue
    const target = glyphForHeadword(headword, glyphsByHeadword)
    if (target !== undefined) propose(headword, target, 'sw-headword')
  }

  // 2. yigezi TS (简体/异体 → 繁体)
  for (const [simplified, trads] of Object.entries(ctx.TS)) {
    const candidates = charsOf(trads)
    const glyphHit = candidates.find((c) => ctx.glyphSet.has(c))
    if (glyphHit !== undefined) {
      propose(simplified, glyphHit, 'ts')
      continue
    }
    const headwordHit = candidates.find((c) => ctx.SW[c] !== undefined)
    if (headwordHit !== undefined) {
      const target = glyphForHeadword(headwordHit, glyphsByHeadword)
      if (target !== undefined) propose(simplified, target, 'ts')
    }
  }

  // 3. OpenCC: discover simplified input forms for glyphs and headwords.
  for (const glyph of ctx.glyphSet) {
    const simplified = ctx.t2s(glyph)
    if (simplified !== glyph && [...simplified].length === 1) propose(simplified, glyph, 'opencc')
  }
  for (const headword of Object.keys(ctx.SW)) {
    if (ctx.glyphSet.has(headword)) continue
    const simplified = ctx.t2s(headword)
    if (simplified === headword || [...simplified].length !== 1) continue
    const target = glyphForHeadword(headword, glyphsByHeadword)
    if (target !== undefined) propose(simplified, target, 'opencc')
  }

  // 4. reverse 重文
  for (const [headword, record] of Object.entries(ctx.SW)) {
    const w = typeof record.w === 'string' ? record.w : ''
    const target = glyphForHeadword(headword, glyphsByHeadword)
    if (target === undefined) continue
    for (const variant of w) propose(variant, target, 'reverse-w')
  }

  const aliases = new Map()
  const sources = new Map()
  const conflicts = []
  for (const [key, targets] of [...proposals.entries()].sort(([a], [b]) => byCodepoint(a, b))) {
    const targetList = [...targets.keys()].sort(byCodepoint)
    if (targetList.length > 1) {
      conflicts.push({
        key,
        candidates: targetList.map((target) => ({
          glyphChar: target,
          sources: [...(targets.get(target) ?? [])].sort(),
        })),
        excluded: true,
      })
      continue
    }
    const target = targetList[0]
    const via = [...(targets.get(target) ?? [])].sort()[0] ?? 'unknown'
    aliases.set(key, target)
    sources.set(key, via)
  }

  // 5. Manual aliases adjudicate conflicts and override automatic results.
  for (const [key, target] of manualAliases) {
    if (ctx.glyphSet.has(key) || !ctx.glyphSet.has(target)) continue
    aliases.set(key, target)
    sources.set(key, 'manual')
  }

  return { aliases, sources, conflicts }
}

// ---------------------------------------------------------------------------
// XZ attachment
// ---------------------------------------------------------------------------

/** Attach yigezi XZ corrections to headword records. */
function attachCorrections(XZ, ctx, glyphToHeadword, aliases) {
  const attached = new Map()
  const log = []
  for (const [key, entry] of Object.entries(XZ)) {
    const text = typeof entry?.t === 'string' ? entry.t : ''
    if (text === '') continue
    let headword
    let via
    if (ctx.glyphSet.has(key)) {
      headword = glyphToHeadword.get(key)
      via = 'glyph'
    } else if (ctx.SW[key] !== undefined) {
      headword = key
      via = 'headword'
    } else {
      const target = aliases.get(key)
      if (target !== undefined) {
        headword = glyphToHeadword.get(target)
        via = 'alias'
      }
    }
    if (headword === undefined) {
      log.push({ key, attachedTo: null, via: via ?? 'unmatched' })
      continue
    }
    const previous = attached.get(headword)
    if (previous !== undefined && previous.text !== text) {
      log.push({ key, attachedTo: headword, via, precedence: 'first-wins-drop' })
      continue
    }
    attached.set(headword, { text, source: 'yigezi:XZ' })
    log.push({ key, attachedTo: headword, via })
  }
  return { attached, log }
}

// ---------------------------------------------------------------------------
// Record generation
// ---------------------------------------------------------------------------

/** Empty resolution tally. */
function emptyResolution() {
  return { 'manual-headword': 0, 'exact-sw': 0, 'reverse-w': 0, opencc: 0, ts: 0, none: 0 }
}

/**
 * Build the two-layer oracle data plus the audit report.
 * @param source   parsed yigezi snapshot (SW/TS/XZ/HAS_ORAC)
 * @param overrides human alias/headword adjudications
 * @param imageGlyphs D17 image-glyph manifest (char → provenance), or {}
 * @param vernacular  D18 headword → modern paraphrase drafts, or {}
 * @param evolution   D23 headword → evolution spec drafts, or {}
 * @param inlineMap   D21 glyphChar → PUA char (from build-inline-font), or {}
 */
function buildOracle(source, overrides, imageGlyphs, vernacular, evolution, inlineMap) {
  const { SW, TS, XZ, HAS_ORAC } = source
  const fontGlyphSet = new Set(HAS_ORAC)
  if (fontGlyphSet.size !== EXPECTED_GLYPH_COUNT) {
    throw new Error(`invariant: HAS_ORAC must have ${EXPECTED_GLYPH_COUNT} unique glyphs, got ${fontGlyphSet.size}`)
  }

  // D17: image glyphs extend the corpus but must not overlap the font layer.
  const imageChars = Object.keys(imageGlyphs)
  for (const char of imageChars) {
    if (fontGlyphSet.has(char)) {
      throw new Error(`invariant: image glyph ${char} overlaps the font cmap`)
    }
  }
  const glyphSet = new Set([...HAS_ORAC, ...imageChars])

  const s2tw = OpenCC.Converter({ from: 'cn', to: 't' })
  const t2s = OpenCC.Converter({ from: 't', to: 'cn' })
  const ctx = {
    SW,
    TS,
    glyphSet,
    reverseW: buildReverseWIndex(SW),
    s2t: s2tw,
    t2s,
  }

  const manualHeadwords = new Map()
  const manualAliases = new Map()
  for (const entry of overrides) {
    if (entry.kind === 'headword') manualHeadwords.set(entry.from, entry.to)
    else if (entry.kind === 'alias') manualAliases.set(entry.from, entry.to)
  }

  // Resolve every glyph (font + image) and group glyphs by headword.
  const glyphToHeadword = new Map()
  const resolution = emptyResolution()
  const fontResolution = emptyResolution()
  const imageResolution = emptyResolution()
  const reverseConflicts = []
  const unresolved = []
  const resolveInto = (char, tally) => {
    const resolved = resolveHeadword(char, ctx, manualHeadwords)
    glyphToHeadword.set(char, resolved.headword)
    if (resolved.headword === null) unresolved.push(char)
    tally[resolved.resolvedBy] += 1
    resolution[resolved.resolvedBy] += 1
    if (resolved.conflicts.length > 0) {
      reverseConflicts.push({ char, headword: resolved.headword, candidates: resolved.conflicts[0] })
    }
  }
  for (const char of HAS_ORAC) resolveInto(char, fontResolution)
  for (const char of imageChars) resolveInto(char, imageResolution)

  const glyphsByHeadword = new Map()
  for (const [char, headword] of glyphToHeadword) {
    if (headword === null) continue
    let list = glyphsByHeadword.get(headword)
    if (list === undefined) {
      list = []
      glyphsByHeadword.set(headword, list)
    }
    list.push(char)
  }

  const { aliases, sources: aliasSources, conflicts: aliasConflicts } =
    buildAliases(ctx, glyphToHeadword, glyphsByHeadword, manualAliases)
  const { attached: corrections, log: xzLog } = attachCorrections(XZ, ctx, glyphToHeadword, aliases)

  // headwords
  const headwords = {}
  let vernacularWritten = 0
  let evolutionWritten = 0
  for (const headword of [...glyphsByHeadword.keys()].sort(byCodepoint)) {
    const record = SW[headword]
    if (record === undefined) throw new Error(`invariant: headword ${headword} missing from SW`)
    if (typeof record.e !== 'string' || record.e === '') {
      throw new Error(`invariant: headword ${headword} has empty 说文 original`)
    }
    // D18: merge human/batch paraphrase drafts; absent ones stay empty.
    const paraphrase = typeof vernacular[headword] === 'string' ? vernacular[headword].trim() : ''
    if (paraphrase !== '') vernacularWritten += 1
    // D23: merge evolution drafts; absent ones stay null ("演变资料整理中").
    const evolutionSpec = evolution[headword] ?? null
    if (evolutionSpec !== null) evolutionWritten += 1
    headwords[headword] = {
      shuowen: {
        original: record.e,
        vernacular: paraphrase,
        vernacularStatus: 'draft',
        correction: corrections.get(headword) ?? null,
      },
      pinyin: typeof record.p === 'string' && record.p !== '' ? record.p : null,
      radical: typeof record.r === 'string' && record.r !== '' ? record.r : null,
      glyphChars: [...glyphsByHeadword.get(headword)].sort(byCodepoint),
      evolution: evolutionSpec,
      sources: { shuowen: 'shuowen.org via yigezi' },
    }
  }

  // glyphs (font + image, each tagged with its rendering source + inline PUA)
  const glyphs = {}
  let inlineWritten = 0
  for (const char of [...glyphSet].sort(byCodepoint)) {
    const headword = glyphToHeadword.get(char) ?? null
    const resolvedBy = resolveResolvedBy(char, headword, ctx, manualHeadwords, resolution)
    // D21: inline PUA from the font script; absent → null (no inline support).
    const inline = typeof inlineMap[char] === 'string' ? inlineMap[char] : null
    if (inline !== null) inlineWritten += 1
    const image = imageGlyphs[char]
    if (image !== undefined) {
      glyphs[char] = {
        headword,
        resolvedBy,
        source: 'image',
        inline,
        image: {
          file: image.file,
          hustId: image.hustId,
          source: image.source,
          citation: image.citation,
          collection: image.collection ?? null,
          group: image.group ?? null,
        },
      }
    } else {
      glyphs[char] = { headword, resolvedBy, source: 'font', inline }
    }
  }

  const aliasObject = {}
  for (const [key, target] of [...aliases.entries()].sort(([a], [b]) => byCodepoint(a, b))) {
    aliasObject[key] = target
  }

  const sharedHeadwords = [...glyphsByHeadword.entries()]
    .filter(([, glyphChars]) => glyphChars.length > 1)
    .map(([headword, glyphChars]) => ({ headword, glyphChars: [...glyphChars].sort(byCodepoint) }))
    .sort((a, b) => byCodepoint(a.headword, b.headword))

  // Baseline without manual headword overrides, so the report always shows how
  // much of the documented 1,196/229 automatic split is still unresolved.
  const automatic = { 'exact-sw': 0, 'reverse-w': 0, opencc: 0, ts: 0, none: 0 }
  for (const char of HAS_ORAC) {
    automatic[resolveHeadword(char, ctx, new Map()).resolvedBy] += 1
  }

  const glossedGlyphs = Object.values(glyphs).filter((record) => record.headword !== null).length
  const counts = {
    glyphs: Object.keys(glyphs).length,
    fontGlyphs: HAS_ORAC.length,
    imageGlyphs: imageChars.length,
    glossedGlyphs,
    glyphOnly: Object.keys(glyphs).length - glossedGlyphs,
    headwords: Object.keys(headwords).length,
    sharedHeadwords: sharedHeadwords.length,
    aliases: Object.keys(aliasObject).length,
  }

  const imageSources = {}
  for (const char of imageChars) {
    const name = imageGlyphs[char].source
    imageSources[name] = (imageSources[name] ?? 0) + 1
  }

  return {
    data: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString().slice(0, 10),
      source: {
        yigezi: 'yigezi-main snapshot (.refs/yigezi-main/index.html)',
        shuowen: 'shuowen.org via yigezi',
        font: 'Oracular (orac.woff2)',
        images: 'HUST-OBC deciphered (arXiv 2401.15365)',
      },
      counts,
      headwords,
      glyphs,
      aliases: aliasObject,
    },
    report: {
      generatedAt: new Date().toISOString(),
      counts,
      resolution,
      fontResolution,
      imageResolution,
      automatic,
      unresolved,
      reverseConflicts,
      aliasConflicts,
      aliasSources: Object.fromEntries([...aliasSources.entries()]),
      xz: xzLog,
      sharedHeadwords,
      imageChars: [...imageChars].sort(byCodepoint),
      imageSources,
      vernacularWritten,
      vernacularUnwritten: counts.headwords - vernacularWritten,
      evolutionWritten,
      evolutionUnwritten: counts.headwords - evolutionWritten,
      inlineWritten,
      inlineUnwritten: counts.glyphs - inlineWritten,
    },
    clientGlyphs: buildClientGlyphs(glyphs, headwords),
  }
}

/**
 * D23: the client-side reduced dataset, inlined into the client bundle by a
 * tsdown virtual module. One entry per glyph; carries only what the daily-glyph
 * widget and inline rendering need. Kept consistent with oracle.json.
 */
function buildClientGlyphs(glyphs, headwords) {
  const entries = {}
  for (const char of Object.keys(glyphs).sort(byCodepoint)) {
    const record = glyphs[char]
    const headword = record.headword
    const hw = headword === null ? undefined : headwords[headword]
    entries[char] = {
      source: record.source,
      headword,
      pinyin: hw?.pinyin ?? null,
      original: hw?.shuowen.original ?? null,
      vernacular: hw?.shuowen.vernacular ?? '',
      evolution: hw?.evolution ?? null,
      inline: record.inline,
    }
  }
  return entries
}

/**
 * Recompute the resolvedBy path for the record (the resolver already ran;
 * this keeps the audit value independent of grouping order).
 */
function resolveResolvedBy(char, headword, ctx, manualHeadwords, resolution) {
  if (headword === null) return 'none'
  if (manualHeadwords.has(char)) return 'manual-headword'
  if (ctx.SW[char] !== undefined) return 'exact-sw'
  const reverse = ctx.reverseW.get(char)
  if (reverse !== undefined && reverse.includes(headword)) return 'reverse-w'
  const converted = charsOf(ctx.s2t(char))
  if (converted.includes(headword)) return 'opencc'
  return 'ts'
}

// ---------------------------------------------------------------------------
// Font verification
// ---------------------------------------------------------------------------

/** Read the font's cmap character set and glyph-sharing statistics. */
function inspectFont(fontFile) {
  const font = (fk.openSync ?? fk.default.openSync)(fontFile)
  const codepoints = font.characterSet
  const nonCharacter = codepoints.filter((cp) => NON_CHARACTER_CODEPOINTS.has(cp))
  const chars = codepoints
    .filter((cp) => !NON_CHARACTER_CODEPOINTS.has(cp))
    .map((cp) => String.fromCodePoint(cp))
  const glyphIds = chars.map((char) => {
    const cp = char.codePointAt(0)
    return cp === undefined ? null : font.glyphForCodePoint(cp).id
  })
  const counts = new Map()
  for (const id of glyphIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  const shared = [...counts.values()].filter((n) => n > 1)
  return {
    chars: new Set(chars),
    stats: {
      cmapEntries: codepoints.length,
      nonCharacterCodepoints: nonCharacter.map((cp) => `U+${cp.toString(16).toUpperCase()}`),
      glyphs: chars.length,
      uniqueGlyphs: new Set(glyphIds).size,
      sharedGlyphs: shared.length,
      extraCodepoints: shared.reduce((sum, n) => sum + n - 1, 0),
    },
  }
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

/** Throw when the generated data violates the runtime contract. */
function assertInvariants(data, fontChars, fontStats, imageGlyphs, dataDir, clientGlyphs) {
  const failures = []
  const glyphKeys = Object.keys(data.glyphs)
  const headwordKeys = Object.keys(data.headwords)
  const fontKeys = glyphKeys.filter((char) => data.glyphs[char].source === 'font')
  const imageKeys = glyphKeys.filter((char) => data.glyphs[char].source === 'image')

  // Font layer is fixed at 1,425 and must equal the font cmap exactly.
  if (fontKeys.length !== EXPECTED_GLYPH_COUNT) {
    failures.push(`font glyphs must be ${EXPECTED_GLYPH_COUNT}, got ${fontKeys.length}`)
  }
  if (fontKeys.length !== fontChars.size) {
    failures.push(`font glyphs (${fontKeys.length}) must equal font cmap (${fontChars.size})`)
  }
  for (const char of fontKeys) {
    if (!fontChars.has(char)) failures.push(`font glyph ${char} is absent from the font cmap`)
  }
  for (const char of fontChars) {
    if (data.glyphs[char] === undefined) failures.push(`font cmap char ${char} is absent from glyphs`)
  }

  // Total = font + image; image glyphs carry provenance and a real PNG.
  if (glyphKeys.length !== EXPECTED_GLYPH_COUNT + imageKeys.length) {
    failures.push(`total glyphs (${glyphKeys.length}) must equal font + image (${EXPECTED_GLYPH_COUNT} + ${imageKeys.length})`)
  }
  if (data.counts.fontGlyphs !== fontKeys.length) {
    failures.push(`counts.fontGlyphs (${data.counts.fontGlyphs}) != ${fontKeys.length}`)
  }
  if (data.counts.imageGlyphs !== imageKeys.length) {
    failures.push(`counts.imageGlyphs (${data.counts.imageGlyphs}) != ${imageKeys.length}`)
  }
  for (const char of imageKeys) {
    if (fontChars.has(char)) failures.push(`image glyph ${char} overlaps the font cmap`)
    const image = data.glyphs[char].image
    if (image === undefined) {
      failures.push(`image glyph ${char} has no provenance`)
      continue
    }
    for (const field of ['file', 'hustId', 'source', 'citation']) {
      if (typeof image[field] !== 'string' || image[field] === '') {
        failures.push(`image glyph ${char} provenance.${field} must be a non-empty string`)
      }
    }
    if (typeof image.file === 'string' && !fs.existsSync(path.join(dataDir, image.file))) {
      failures.push(`image glyph ${char} PNG missing: ${image.file}`)
    }
    if (imageGlyphs[char] === undefined) {
      failures.push(`image glyph ${char} is absent from hust-glyphs.json`)
    }
  }

  for (const char of glyphKeys) {
    const headword = data.glyphs[char].headword
    if (headword !== null && data.headwords[headword] === undefined) {
      failures.push(`glyph ${char} references missing headword ${headword}`)
    }
  }
  const referenced = new Set()
  for (const char of glyphKeys) {
    const headword = data.glyphs[char].headword
    if (headword !== null) referenced.add(headword)
  }
  for (const headword of headwordKeys) {
    if (!referenced.has(headword)) failures.push(`headword ${headword} is not referenced by any glyph`)
    const record = data.headwords[headword]
    if (typeof record.shuowen?.original !== 'string' || record.shuowen.original === '') {
      failures.push(`headword ${headword} has empty 说文 original`)
    }
    for (const field of ['mc', 'pos', 'oc', 'ocsrc']) {
      if (Object.hasOwn(record, field)) failures.push(`headword ${headword} leaks phonetic field ${field}`)
    }
  }
  if (referenced.size !== headwordKeys.length) {
    failures.push(`headword key set (${headwordKeys.length}) must equal referenced set (${referenced.size})`)
  }
  for (const [key, target] of Object.entries(data.aliases)) {
    if (data.glyphs[key] !== undefined) failures.push(`alias key ${key} collides with a glyph`)
    if (data.glyphs[target] === undefined) failures.push(`alias ${key} targets missing glyph ${target}`)
    if (!/^\p{Script=Han}$/u.test(key)) failures.push(`alias key ${key} is not a single Han character`)
  }
  if (fontStats.glyphs !== EXPECTED_GLYPH_COUNT) {
    failures.push(`font glyph count ${fontStats.glyphs} != ${EXPECTED_GLYPH_COUNT}`)
  }

  // D21: inline PUA must be a single char in range, unique across the corpus.
  const seenInline = new Set()
  for (const char of glyphKeys) {
    const inline = data.glyphs[char].inline
    if (inline === null || inline === undefined) continue
    const cp = typeof inline === 'string' ? inline.codePointAt(0) : undefined
    if (typeof inline !== 'string' || [...inline].length !== 1 || cp === undefined || cp < PUA_START || cp > PUA_END) {
      failures.push(`glyph ${char} inline must be a single PUA char (U+E000-U+F8FF)`)
      continue
    }
    if (seenInline.has(inline)) failures.push(`glyph ${char} inline duplicates another PUA codepoint`)
    seenInline.add(inline)
  }

  // D23: evolution must be null or a well-formed {stages, status} spec.
  for (const headword of headwordKeys) {
    const evolution = data.headwords[headword].evolution
    if (evolution === null || evolution === undefined) continue
    if (evolution.status !== 'draft' && evolution.status !== 'reviewed') {
      failures.push(`headword ${headword} evolution.status must be draft/reviewed`)
    }
    if (!Array.isArray(evolution.stages) || evolution.stages.length === 0) {
      failures.push(`headword ${headword} evolution.stages must be a non-empty array`)
      continue
    }
    for (const [i, stage] of evolution.stages.entries()) {
      if (typeof stage?.name !== 'string' || stage.name === '' || typeof stage?.note !== 'string' || stage.note === '') {
        failures.push(`headword ${headword} evolution.stages[${i}] needs non-empty name/note`)
      }
    }
  }

  // D23: client-glyphs.json must mirror oracle.json (keys, inline, evolution).
  if (clientGlyphs !== undefined) {
    const clientKeys = Object.keys(clientGlyphs)
    if (clientKeys.length !== glyphKeys.length) {
      failures.push(`client-glyphs count (${clientKeys.length}) != glyphs (${glyphKeys.length})`)
    }
    for (const char of glyphKeys) {
      const entry = clientGlyphs[char]
      if (entry === undefined) {
        failures.push(`client-glyphs missing glyph ${char}`)
        continue
      }
      if (entry.inline !== data.glyphs[char].inline) {
        failures.push(`client-glyphs ${char} inline disagrees with oracle.json`)
      }
      const headword = data.glyphs[char].headword
      const expectedEvolution = headword === null ? null : data.headwords[headword].evolution
      if (JSON.stringify(entry.evolution) !== JSON.stringify(expectedEvolution)) {
        failures.push(`client-glyphs ${char} evolution disagrees with oracle.json`)
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`data invariants failed:\n- ${failures.join('\n- ')}`)
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Sort object keys by codepoint for stable output. */
function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Write a file, creating its directory. */
function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

/** Load the human override table, creating an empty one when absent. */
function loadOverrides(file) {
  if (!fs.existsSync(file)) {
    if (!CHECK_ONLY) writeFile(file, '[]\n')
    return []
  }
  const parsed = JSON.parse(readText(file))
  if (!Array.isArray(parsed)) throw new Error('alias-overrides.json must be a JSON array')
  for (const [index, entry] of parsed.entries()) {
    const where = `alias-overrides.json[${index}]`
    if (entry === null || typeof entry !== 'object') throw new Error(`${where} must be an object`)
    if (entry.kind !== 'headword' && entry.kind !== 'alias') {
      throw new Error(`${where}.kind must be "headword" or "alias"`)
    }
    for (const key of ['from', 'to', 'source', 'note']) {
      if (typeof entry[key] !== 'string' || entry[key] === '') throw new Error(`${where}.${key} must be a non-empty string`)
    }
  }
  return parsed
}

/**
 * Load the D17 image-glyph manifest produced by expand-hust/build-images.py.
 * Absent means "no expansion": the corpus stays font-only. Never created here.
 * @returns {Record<string, object>} char → provenance
 */
function loadImageGlyphs(file) {
  if (!fs.existsSync(file)) return {}
  const parsed = JSON.parse(readText(file))
  if (parsed === null || typeof parsed !== 'object' || typeof parsed.glyphs !== 'object') {
    throw new Error('hust-glyphs.json must be an object with a glyphs map')
  }
  for (const [char, entry] of Object.entries(parsed.glyphs)) {
    const where = `hust-glyphs.json.glyphs.${char}`
    if (entry === null || typeof entry !== 'object') throw new Error(`${where} must be an object`)
    for (const key of ['file', 'hustId', 'source', 'citation']) {
      if (typeof entry[key] !== 'string' || entry[key] === '') throw new Error(`${where}.${key} must be a non-empty string`)
    }
  }
  return parsed.glyphs
}

/**
 * Load the D18 vernacular paraphrase table (headword → modern draft).
 * Human/batch artifact: created empty once, never overwritten by re-extraction.
 * @returns {Record<string, string>}
 */
function loadVernacular(file) {
  if (!fs.existsSync(file)) {
    if (!CHECK_ONLY) writeFile(file, '{}\n')
    return {}
  }
  const parsed = JSON.parse(readText(file))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('vernacular-overrides.json must be a JSON object keyed by headword')
  }
  for (const [headword, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') throw new Error(`vernacular-overrides.json.${headword} must be a string`)
  }
  return parsed
}

/**
 * Load the D23 evolution table (headword → {stages, status} draft).
 * Human/batch artifact: created empty once, never overwritten by re-extraction.
 * @returns {Record<string, object>}
 */
function loadEvolution(file) {
  if (!fs.existsSync(file)) {
    if (!CHECK_ONLY) writeFile(file, '{}\n')
    return {}
  }
  const parsed = JSON.parse(readText(file))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('evolution-overrides.json must be a JSON object keyed by headword')
  }
  for (const [headword, value] of Object.entries(parsed)) {
    const where = `evolution-overrides.json.${headword}`
    if (value === null || typeof value !== 'object') throw new Error(`${where} must be an object`)
    if (value.status !== 'draft' && value.status !== 'reviewed') {
      throw new Error(`${where}.status must be "draft" or "reviewed"`)
    }
    if (!Array.isArray(value.stages) || value.stages.length === 0) {
      throw new Error(`${where}.stages must be a non-empty array`)
    }
    for (const [i, stage] of value.stages.entries()) {
      if (typeof stage?.name !== 'string' || stage.name === '' || typeof stage?.note !== 'string' || stage.note === '') {
        throw new Error(`${where}.stages[${i}] needs non-empty name/note`)
      }
    }
  }
  return parsed
}

/**
 * Load the D21 inline PUA map produced by build-inline-font/build.py.
 * Absent means "font script not run": every glyph gets inline:null and a warning
 * is recorded. Extraction can run independently of the font script. Never created.
 * @returns {{map: Record<string, string>, warning: string|null}}
 */
function loadInlineMap(file) {
  if (!fs.existsSync(file)) {
    return { map: {}, warning: 'inline-map.json absent; all glyphs inline:null (run build-inline-font)' }
  }
  const parsed = JSON.parse(readText(file))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('inline-map.json must be a JSON object keyed by glyphChar')
  }
  const seen = new Set()
  for (const [char, value] of Object.entries(parsed)) {
    const cp = typeof value === 'string' ? value.codePointAt(0) : undefined
    if (typeof value !== 'string' || [...value].length !== 1 || cp === undefined || cp < PUA_START || cp > PUA_END) {
      throw new Error(`inline-map.json.${char} must be a single PUA char (U+E000-U+F8FF)`)
    }
    if (seen.has(value)) throw new Error(`inline-map.json.${char} duplicates a PUA codepoint`)
    seen.add(value)
  }
  return { map: parsed, warning: null }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const indexHtml = path.join(REFS, 'index.html')
  const fontFile = path.join(REFS, 'orac.woff2')
  if (!fs.existsSync(indexHtml)) throw new Error(`missing source snapshot: ${indexHtml}`)
  if (!fs.existsSync(fontFile)) throw new Error(`missing font: ${fontFile}`)

  const html = readText(indexHtml)
  const source = extractSource(html)
  const overridesFile = path.join(OUT, 'alias-overrides.json')
  const overrides = loadOverrides(overridesFile)
  const imageGlyphsFile = path.join(OUT, 'hust-glyphs.json')
  const imageGlyphs = loadImageGlyphs(imageGlyphsFile)
  const vernacularFile = path.join(OUT, 'vernacular-overrides.json')
  const vernacular = loadVernacular(vernacularFile)
  const evolutionFile = path.join(OUT, 'evolution-overrides.json')
  const evolution = loadEvolution(evolutionFile)
  const inlineMapFile = path.join(OUT, 'inline-map.json')
  const { map: inlineMap, warning: inlineWarning } = loadInlineMap(inlineMapFile)
  const { data, report, clientGlyphs } = buildOracle(source, overrides, imageGlyphs, vernacular, evolution, inlineMap)
  if (inlineWarning !== null) report.inlineWarning = inlineWarning

  const font = inspectFont(fontFile)
  assertInvariants(data, font.chars, font.stats, imageGlyphs, OUT, clientGlyphs)

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: data.generatedAt,
    source: {
      snapshot: 'yigezi-main',
      indexHtmlSha256: sha256File(indexHtml),
      fontSha256: sha256File(fontFile),
      fontBytes: fs.statSync(fontFile).size,
      opencc: 'opencc-js 1.4.2 (build-time only)',
      shuowen: 'shuowen.org via yigezi',
      images: 'HUST-OBC deciphered (arXiv 2401.15365)',
      hustGlyphsSha256: fs.existsSync(imageGlyphsFile) ? sha256File(imageGlyphsFile) : null,
      inlineFontSha256: fs.existsSync(path.join(FONT_OUT, 'zhenren-inline.woff2'))
        ? sha256File(path.join(FONT_OUT, 'zhenren-inline.woff2'))
        : null,
      inlineMapSha256: fs.existsSync(inlineMapFile) ? sha256File(inlineMapFile) : null,
    },
    counts: data.counts,
    font: font.stats,
    content: {
      vernacularWritten: report.vernacularWritten,
      evolutionWritten: report.evolutionWritten,
      inlineWritten: report.inlineWritten,
    },
    licenses: {
      font: 'OFL-1.1',
      inlineFont: 'OFL-1.1 (ZhenrenInline, renamed derivative of Oracular)',
      shuowen: 'Apache-2.0',
      yigezi: 'MIT',
      opencc: 'Apache-2.0 (build-time only)',
      images: 'public-domain glyphs (HUST-OBC, arXiv 2401.15365)',
    },
    attribution: `${ATTRIBUTION}${BOUNDARY_SUFFIX}`,
  }

  if (!CHECK_ONLY) {
    writeFile(path.join(OUT, 'oracle.json'), stableJson(data))
    writeFile(path.join(OUT, 'manifest.json'), stableJson(manifest))
    writeFile(path.join(OUT, 'extraction-report.json'), stableJson(report))
    writeFile(path.join(OUT, 'client-glyphs.json'), stableJson(clientGlyphs))
    fs.mkdirSync(FONT_OUT, { recursive: true })
    // Original font: byte-identical copy, never modified (D6).
    fs.copyFileSync(fontFile, path.join(FONT_OUT, 'orac.woff2'))
    // D25: the snapshot OFL header names the wrong font (Kaiyuan Small Seal).
    // Keep the OFL body but replace the header with the correct Oracular copyright.
    const oflDir = path.join(REFS, 'licenses')
    const oflSource = fs.existsSync(path.join(oflDir, 'OFL-1.1.txt'))
      ? path.join(oflDir, 'OFL-1.1.txt')
      : path.join(REFS, 'LICENSE')
    const oflText = readText(oflSource)
    const markerAt = oflText.indexOf(OFL_MARKER)
    if (markerAt < 0) throw new Error('OFL source missing license marker; cannot fix copyright header')
    writeFile(path.join(FONT_OUT, 'OFL.txt'), `${ORACULAR_COPYRIGHT}\n\n${oflText.slice(markerAt)}`)
    fs.copyFileSync(path.join(REFS, 'THIRD_PARTY_NOTICES.md'), path.join(FONT_OUT, 'THIRD_PARTY_NOTICES.md'))
    // The ZhenrenInline derivative + its OFL are produced by build-inline-font;
    // extraction leaves them in place (does not regenerate or clobber them).
  }

  const summary = {
    mode: CHECK_ONLY ? 'check' : 'write',
    counts: data.counts,
    resolution: report.resolution,
    unresolved: report.unresolved.length,
    aliasConflicts: report.aliasConflicts.length,
    font: font.stats,
    content: manifest.content,
    inlineWarning: report.inlineWarning ?? null,
    sourceHashes: {
      indexHtml: manifest.source.indexHtmlSha256.slice(0, 16),
      font: manifest.source.fontSha256.slice(0, 16),
    },
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main()
