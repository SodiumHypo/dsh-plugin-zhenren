/**
 * Adjudication analysis (CLAUDE.md §3.10, ROADMAP M3).
 *
 * Dev-only audit: lists the font glyphs with no 说文 headword and gathers
 * *data-internal* evidence for candidate mappings. It never writes overrides;
 * a human decides each entry. Two evidence kinds are surfaced:
 *   1. a curated candidate target exists in SW (with its original text);
 *   2. some SW headword's original explicitly mentions the glyph char in a
 *      "作X / 爲X / 即X / 今X / 隸X / 俗X" note — the strongest internal proof
 *      (the 于→亏 case: 亏 "今變隸作于").
 *
 * Usage: node scripts/adjudicate/analyze.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(root, '../..')
const html = fs.readFileSync(path.join(repoRoot, '.refs/yigezi-main/index.html'), 'utf8')

function extractObject(text, name, searchFrom = 0) {
  const marker = `${name}={`
  const at = text.indexOf(marker, searchFrom)
  if (at < 0) throw new Error(`object ${name} not found`)
  const start = at + marker.length - 1
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
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
      if (depth === 0) return JSON.parse(text.slice(start, i + 1))
    }
  }
  throw new Error(`object ${name} unterminated`)
}

const SW = extractObject(html, 'SW')
const report = JSON.parse(fs.readFileSync(path.join(root, 'data/extraction-report.json'), 'utf8'))
const oracle = JSON.parse(fs.readFileSync(path.join(root, 'data/oracle.json'), 'utf8'))

// Font glyphs still without a headword (the 223 content debt).
const unresolved = Object.entries(oracle.glyphs)
  .filter(([, r]) => r.source === 'font' && r.headword === null)
  .map(([c]) => c)
console.log('=== unresolved font glyphs:', unresolved.length, '===')
console.log(unresolved.join(' '))

// Curated candidates from prior analysis; verify each target exists in SW.
const candidates = {
  雪: '䨮', 雷: '靁', 阜: '𨸏', 朋: '鳳', 暮: '莫', 翌: '翊', 農: '䢉', 康: '穅',
  抱: '捊', 埜: '野', 巛: '川', 擒: '禽', 徠: '來', 槁: '槀', 稚: '稺', 珏: '玨',
  顛: '顚', 羈: '羇', 煮: '煑', 焚: '燓', 焦: '𤓪', 飲: '㱃', 霍: '靃', 龝: '秋',
  氵: '水', 艹: '艸', 辶: '辵', 镸: '長', 爫: '爪', 髙: '高', 眀: '朙', 収: '收',
  啓: '啟', 廼: '乃', 迺: '乃', 冑: '胄', 殞: '隕', 汰: '汏', 獏: '貘', 聀: '職',
  舎: '舍', 綠: '緑', 歿: '歾', 殁: '歾', 髭: '頿', 鳸: '雇', 叩: '敂', 嚮: '向',
  嬉: '娭', 孽: '孼', 叟: '叜',
  // Second batch: structural radical forms and well-attested 异体/古今字.
  廾: '𠬞', 盖: '蓋', 衛: '衞', 鄉: '鄕', 寢: '寑', 災: '烖', 飮: '㱃',
  耋: '耊', 函: '圅', 冏: '囧', 冉: '冄', 乘: '椉', 並: '竝', 柳: '桺',
  霰: '䨘', 妍: '姸', 姫: '姬', 匄: '匃', 尋: '𢒫', 泪: '淚',
}
console.log('\n=== curated candidates (target in SW?) ===')
for (const [from, to] of Object.entries(candidates)) {
  const inGlyphs = oracle.glyphs[from] !== undefined
  const fromIsUnresolved = unresolved.includes(from)
  const rec = SW[to]
  const exists = rec !== undefined
  const orig = exists ? String(rec.e ?? '').slice(0, 40) : '—'
  const w = exists ? String(rec.w ?? '') : ''
  console.log(
    `${from}→${to} | unresolved:${fromIsUnresolved} targetInSW:${exists} | w:[${w}] | ${orig}`,
  )
}

// Data-internal evidence: SW originals that mention an unresolved char in a note.
console.log('\n=== SW originals mentioning an unresolved char (作/爲/即/今/隸/俗 cues) ===')
const cues = ['作', '爲', '为', '即', '今', '隸', '隶', '俗', '或', '又']
const hits = []
for (const [headword, rec] of Object.entries(SW)) {
  const orig = String(rec.e ?? '')
  for (const c of unresolved) {
    let idx = orig.indexOf(c)
    while (idx >= 0) {
      const before = orig.slice(Math.max(0, idx - 3), idx)
      if (cues.some((cue) => before.includes(cue))) {
        hits.push(`${c} ← ${headword}: …${orig.slice(Math.max(0, idx - 6), idx + 4)}…`)
        break
      }
      idx = orig.indexOf(c, idx + 1)
    }
  }
}
console.log(hits.slice(0, 120).join('\n'))
console.log('total internal-cue hits:', hits.length)