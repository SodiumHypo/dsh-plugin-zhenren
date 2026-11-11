/**
 * Offline extraction from the yigezi snapshot (`../../.refs/yigezi-main`).
 *
 * Produces the runtime data contract described in CLAUDE.md §3:
 *   data/oracle.json             headwords + glyphs + aliases
 *   data/manifest.json           counts, source hashes, licenses
 *   data/extraction-report.json  resolution paths, unresolved list, conflicts
 *   data/fonts/orac.woff2        byte-identical font copy
 *   data/fonts/OFL.txt           license text
 *   data/fonts/THIRD_PARTY_NOTICES.md
 *   data/alias-overrides.json    human-maintained overrides (created empty once)
 *   data/vernacular-overrides.json  human/batch paraphrases (D18; created empty once)
 *
 * D17 expansion: when `data/hust-glyphs.json` is present (produced by
 * scripts/expand-hust/build-images.py), its image glyphs are merged into the
 * corpus with `source: "image"` and full provenance. The font layer stays
 * exactly 1,425 glyphs; the total grows by the image count.
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

const SCHEMA_VERSION = 2
/** The font layer is fixed; image glyphs (D17) are added on top of it. */
const EXPECTED_GLYPH_COUNT = 1425
const NON_CHARACTER_CODEPOINTS = new Set([0xffff])

/** Sources-only attribution; the boundary sentence is product copy (locale). */
const ATTRIBUTION =
  '字形：Oracular（OFL-1.1）、HUST-OBC 已释字图像（公有领域，arXiv 2401.15365）。《说文》文本：shuowen.org（Apache-2.0）。数据整理：yigezi（MIT）。'
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
 */
function buildOracle(source, overrides, imageGlyphs, vernacular) {
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
  for (const headword of [...glyphsByHeadword.keys()].sort(byCodepoint)) {
    const record = SW[headword]
    if (record === undefined) throw new Error(`invariant: headword ${headword} missing from SW`)
    if (typeof record.e !== 'string' || record.e === '') {
      throw new Error(`invariant: headword ${headword} has empty 说文 original`)
    }
    // D18: merge human/batch paraphrase drafts; absent ones stay empty.
    const paraphrase = typeof vernacular[headword] === 'string' ? vernacular[headword].trim() : ''
    if (paraphrase !== '') vernacularWritten += 1
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
      sources: { shuowen: 'shuowen.org via yigezi' },
    }
  }

  // glyphs (font + image, each tagged with its rendering source)
  const glyphs = {}
  for (const char of [...glyphSet].sort(byCodepoint)) {
    const headword = glyphToHeadword.get(char) ?? null
    const resolvedBy = resolveResolvedBy(char, headword, ctx, manualHeadwords, resolution)
    const image = imageGlyphs[char]
    if (image !== undefined) {
      glyphs[char] = {
        headword,
        resolvedBy,
        source: 'image',
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
      glyphs[char] = { headword, resolvedBy, source: 'font' }
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
    },
  }
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
function assertInvariants(data, fontChars, fontStats, imageGlyphs, dataDir) {
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
  const { data, report } = buildOracle(source, overrides, imageGlyphs, vernacular)

  const font = inspectFont(fontFile)
  assertInvariants(data, font.chars, font.stats, imageGlyphs, OUT)

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
    },
    counts: data.counts,
    font: font.stats,
    licenses: {
      font: 'OFL-1.1',
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
    fs.mkdirSync(FONT_OUT, { recursive: true })
    fs.copyFileSync(fontFile, path.join(FONT_OUT, 'orac.woff2'))
    const oflDir = path.join(REFS, 'licenses')
    const ofl = fs.existsSync(path.join(oflDir, 'OFL-1.1.txt'))
      ? path.join(oflDir, 'OFL-1.1.txt')
      : path.join(REFS, 'LICENSE')
    fs.copyFileSync(ofl, path.join(FONT_OUT, 'OFL.txt'))
    fs.copyFileSync(path.join(REFS, 'THIRD_PARTY_NOTICES.md'), path.join(FONT_OUT, 'THIRD_PARTY_NOTICES.md'))
  }

  const summary = {
    mode: CHECK_ONLY ? 'check' : 'write',
    counts: data.counts,
    resolution: report.resolution,
    unresolved: report.unresolved.length,
    aliasConflicts: report.aliasConflicts.length,
    font: font.stats,
    sourceHashes: {
      indexHtml: manifest.source.indexHtmlSha256.slice(0, 16),
      font: manifest.source.fontSha256.slice(0, 16),
    },
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main()
