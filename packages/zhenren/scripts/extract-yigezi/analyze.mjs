// Temporary analysis script: verify yigezi data facts before committing the schema.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../../..')
const html = fs.readFileSync(path.join(ROOT, '.refs/yigezi-main/index.html'), 'utf8')

/** Extract a `NAME={` object literal by brace matching, then JSON.parse it. */
function extractObject(name) {
  const marker = `${name}={`
  const at = html.indexOf(marker)
  if (at < 0) throw new Error(`no object ${name}`)
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
      if (depth === 0) return JSON.parse(html.slice(start, i + 1))
    }
  }
  throw new Error(`unterminated object ${name}`)
}

/** Extract a `NAME=`...`` backtick literal (no interpolation expected). */
function extractBacktick(name) {
  const marker = `${name}=`
  const at = html.indexOf(marker)
  if (at < 0) throw new Error(`no backtick ${name}`)
  const q = html.indexOf('`', at + marker.length)
  if (q < 0) throw new Error(`no opening backtick for ${name}`)
  const end = html.indexOf('`', q + 1)
  if (end < 0) throw new Error(`no closing backtick for ${name}`)
  return html.slice(q + 1, end)
}

const SW = extractObject('SW')
const XZ = extractObject('XZ')
const HAS_ORAC = [...new Set(extractBacktick('HAS_ORAC'))]
const HAS_SEAL = [...new Set(extractBacktick('HAS_SEAL'))]

// TS lives in the same const as SW, after SW's closing brace: find "TS={" after SW.
function extractSecondObject(name, afterMarker) {
  const from = html.indexOf(afterMarker)
  const at = html.indexOf(`${name}={`, from)
  if (at < 0) throw new Error(`no second object ${name}`)
  // reuse brace matcher by slicing from at
  const start = at + name.length + 1
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return JSON.parse(html.slice(start, i + 1)) }
  }
  throw new Error(`unterminated ${name}`)
}

const TS = extractSecondObject('TS', 'TS={')

console.log('SW entries:', Object.keys(SW).length)
console.log('TS entries:', Object.keys(TS).length)
console.log('XZ entries:', Object.keys(XZ).length)
console.log('HAS_ORAC unique:', HAS_ORAC.length)
console.log('HAS_SEAL unique:', HAS_SEAL.length)

// Reverse w index
const reverseW = new Map()
let swWithW = 0
for (const [headword, rec] of Object.entries(SW)) {
  if (!rec.w) continue
  swWithW++
  for (const ch of rec.w) {
    if (!ch.trim()) continue
    if (!reverseW.has(ch)) reverseW.set(ch, [])
    const list = reverseW.get(ch)
    if (!list.includes(headword)) list.push(headword)
  }
}
console.log('SW entries with w:', swWithW)
console.log('reverse-w keys:', reverseW.size)

// Resolution priority (no OpenCC for now)
const oracleSet = new Set(HAS_ORAC)
let exact = 0, revW = 0, ts = 0, none = 0
const unresolved = []
const headwords = new Set()
const byPath = { exact: 0, 'reverse-w': 0, ts: 0, none: 0 }
for (const c of HAS_ORAC) {
  if (SW[c]) { byPath.exact++; headwords.add(c); continue }
  const rw = reverseW.get(c)
  if (rw && rw.length) { byPath['reverse-w']++; for (const h of rw) headwords.add(h); continue }
  const cands = [...new Set((TS[c] || '').split('').filter(Boolean))]
  const hit = cands.find((x) => SW[x])
  if (hit) { byPath.ts++; headwords.add(hit); continue }
  byPath.none++
  unresolved.push(c)
}
console.log('resolution:', byPath)
console.log('unique headwords:', headwords.size)
console.log('unresolved count:', unresolved.length)
console.log('unresolved sample:', unresolved.slice(0, 40).join(''))

// Shared headwords: headword referenced by >1 glyph
const glyphToHeadword = new Map()
for (const c of HAS_ORAC) {
  if (SW[c]) { glyphToHeadword.set(c, c); continue }
  const rw = reverseW.get(c)
  if (rw && rw.length) { glyphToHeadword.set(c, rw[0]); continue }
  const hit = [...new Set((TS[c] || '').split('').filter(Boolean))].find((x) => SW[x])
  if (hit) glyphToHeadword.set(c, hit)
}
const hwCount = new Map()
for (const h of glyphToHeadword.values()) hwCount.set(h, (hwCount.get(h) || 0) + 1)
const shared = [...hwCount.entries()].filter(([, n]) => n > 1)
console.log('shared headwords:', shared.length)
console.log('shared:', shared.map(([h, n]) => `${h}:${n}`).join(' '))
console.log('glossed glyphs:', glyphToHeadword.size)

// Alias candidates: SW headwords that are not oracle glyphs
const swHeadsNotGlyph = Object.keys(SW).filter((h) => !oracleSet.has(h))
console.log('SW headwords not in oracle set:', swHeadsNotGlyph.length)

// TS keys that map into oracle set
let tsAlias = 0
for (const [simp, trads] of Object.entries(TS)) {
  if (oracleSet.has(simp)) continue // has its own glyph; not an alias
  const cands = [...new Set(trads.split('').filter(Boolean))]
  if (cands.some((x) => oracleSet.has(x))) tsAlias++
}
console.log('TS keys (non-glyph) mapping to an oracle glyph:', tsAlias)

// XZ keys resolution
for (const k of Object.keys(XZ)) {
  console.log('XZ', k, 'glyph?', oracleSet.has(k), 'sw?', Boolean(SW[k]))
}
