/**
 * Coverage audit: compare the shipped corpus (glyphs + aliases) against the
 * HUST-OBC deciphered character set and classify every uncovered candidate.
 *
 * Build-time analysis only; writes `candidates.json` next to this script.
 * Classification per candidate:
 *   - alias-candidate: the character normalizes (OpenCC s2t / yigezi TS) to a
 *     form that already resolves to a glyph; it should become an alias.
 *   - image-candidate: no existing glyph covers it; a HUST image is the only
 *     honest way to carve it.
 *
 * Dataset layout facts (verified 2026-11-11):
 *   - single-ID dirs hold files directly: `0101/G_0101_….png`
 *   - merged dirs hold one sub-dir per member ID: `1231_1232/1232/…`
 *   - L-source (六位数字编码) images are .jpg, all other sources .png
 *
 * Usage: node scripts/expand-hust/audit.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as OpenCC from 'opencc-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../../..')
const DATA = path.resolve(__dirname, '../../data')
const HUST = path.join(ROOT, '.refs', 'HUST-OBC', 'HUST-OBC', 'deciphered')
const YIGEZI = path.join(ROOT, '.refs', 'yigezi-main', 'index.html')

const oracle = JSON.parse(fs.readFileSync(path.join(DATA, 'oracle.json'), 'utf8'))
const id2ch = JSON.parse(fs.readFileSync(path.join(HUST, 'ID_to_chinese.json'), 'utf8'))

const glyphSet = new Set(Object.keys(oracle.glyphs))
const aliasMap = new Map(Object.entries(oracle.aliases))
const resolves = (c) => glyphSet.has(c) || aliasMap.has(c)
const resolveGlyph = (c) => (glyphSet.has(c) ? c : aliasMap.get(c))

// ID → directory (merged directories like "0011_0012_0013" hold several IDs).
const idToDir = new Map()
for (const dir of fs.readdirSync(HUST)) {
  if (!fs.statSync(path.join(HUST, dir)).isDirectory()) continue
  for (const id of dir.split('_')) idToDir.set(id, dir)
}

/** All image files belonging to one ID (dir root + per-ID sub-dir). */
function filesFor(id) {
  const dir = idToDir.get(id)
  if (dir === undefined) return { dir: null, files: [] }
  const roots = [path.join(HUST, dir), path.join(HUST, dir, id)]
  const files = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const f of fs.readdirSync(root)) {
      if (/\.(png|jpg)$/i.test(f) && f.includes(`_${id}_`)) files.push(f)
    }
  }
  return { dir, files: files.sort() }
}

// yigezi TS table for the alias-candidate check.
const html = fs.readFileSync(YIGEZI, 'utf8')
const tsMarker = 'TS={'
const tsStart = html.indexOf(tsMarker) + tsMarker.length - 1
let depth = 0
let tsEnd = tsStart
for (let i = tsStart; i < html.length; i++) {
  if (html[i] === '{') depth++
  else if (html[i] === '}') {
    depth--
    if (depth === 0) { tsEnd = i + 1; break }
  }
}
const TS = JSON.parse(html.slice(tsStart, tsEnd))

const s2t = OpenCC.Converter({ from: 'cn', to: 't' })

const candidates = []
for (const [id, char] of Object.entries(id2ch)) {
  if (resolves(char)) continue
  const { dir, files } = filesFor(id)
  const sources = [...new Set(files.map((f) => f[0]))].sort()

  // Does an existing glyph/alias already cover this word form?
  const converted = s2t(char)
  const tsCandidates = [...(TS[char] ?? '')]
  const viaS2t = [...converted].map(resolveGlyph).find((c) => c !== undefined)
  const viaTs = tsCandidates.map(resolveGlyph).find((c) => c !== undefined)
  const tradCovered = viaS2t ?? viaTs

  candidates.push({
    char,
    id,
    dir: dir ?? null,
    fileCount: files.length,
    sources,
    class: tradCovered !== undefined ? 'alias-candidate' : 'image-candidate',
    aliasTarget: tradCovered ?? null,
    aliasVia: viaS2t !== undefined ? 'opencc' : viaTs !== undefined ? 'ts' : null,
  })
}

candidates.sort((a, b) => a.char.codePointAt(0) - b.char.codePointAt(0))
const aliasCandidates = candidates.filter((c) => c.class === 'alias-candidate')
const imageCandidates = candidates.filter((c) => c.class === 'image-candidate')

fs.writeFileSync(
  path.join(__dirname, 'candidates.json'),
  `${JSON.stringify({ generatedFrom: 'HUST-OBC deciphered ID_to_chinese.json', total: candidates.length, candidates }, null, 2)}\n`,
)

console.log(`uncovered: ${candidates.length}`)
console.log(`alias-candidates (${aliasCandidates.length}): ${aliasCandidates.map((c) => `${c.char}→${c.aliasTarget}(${c.aliasVia})`).join(' ')}`)
console.log(`image-candidates: ${imageCandidates.length}`)
console.log(`image-candidate chars: ${imageCandidates.map((c) => c.char).join('')}`)
console.log(`no images at all: ${candidates.filter((c) => c.fileCount === 0).map((c) => `${c.char}(${c.id})`).join(' ') || 'none'}`)
console.log(`L-only (jpg): ${imageCandidates.filter((c) => c.sources.join('') === 'L').map((c) => c.char).join('') || 'none'}`)