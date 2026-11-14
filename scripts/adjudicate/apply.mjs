/**
 * Apply verified headword adjudications (CLAUDE.md §3.3, §3.10; ROADMAP M3).
 *
 * Each candidate below is a *character-form* relationship (异体 / 隶变 / 省变 /
 * 初文 / 部首形 / 古今字), NOT a phonetic or semantic guess. Every target was
 * verified to exist as a 《说文》 headword by `analyze.mjs`; the source field
 * quotes that headword's original so a reviewer can check the anchor. Entries
 * are marked 待甲骨学人工复核 — this is sourced content debt, not archaeological
 * authority.
 *
 * Idempotent: existing `from` entries are never overwritten or removed.
 * Usage: node scripts/adjudicate/apply.mjs
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

// from → [to, relationship]. Verified targets only (see analyze.mjs output).
const CANDIDATES = {
  雪: ['䨮', '隶变'], 雷: ['靁', '省变'], 阜: ['𨸏', '隶变部首形'],
  暮: ['莫', '后起古今字'], 翌: ['翊', '异体'], 農: ['䢉', '隶变'],
  抱: ['捊', '或体'], 埜: ['野', '古文'], 巛: ['川', '异体'],
  擒: ['禽', '后起古今字'], 徠: ['來', '后起古今字'], 槁: ['槀', '异体'],
  稚: ['稺', '异体'], 珏: ['玨', '或体'], 顛: ['顚', '异体'],
  焚: ['燓', '省变'], 焦: ['𤓪', '隶变'], 飲: ['㱃', '隶变'],
  霍: ['靃', '省变'], 龝: ['秋', '异体'], 氵: ['水', '部首偏旁形'],
  艹: ['艸', '部首偏旁形'], 辶: ['辵', '部首偏旁形'], 镸: ['長', '部首偏旁形'],
  爫: ['爪', '部首偏旁形'], 髙: ['高', '异体'], 眀: ['朙', '异体'],
  収: ['收', '异体'], 啓: ['啟', '或体'], 廼: ['乃', '异体'],
  迺: ['乃', '异体'], 殞: ['隕', '或体'], 汰: ['汏', '或体'],
  獏: ['貘', '异体'], 聀: ['職', '省变'], 舎: ['舍', '异体'],
  綠: ['緑', '异体'], 歿: ['歾', '或体'], 殁: ['歾', '或体'],
  髭: ['頿', '或体'], 鳸: ['雇', '或体'], 叩: ['敂', '俗字'],
  嚮: ['向', '后起古今字'], 嬉: ['娭', '或体'], 孽: ['孼', '俗字'],
  叟: ['叜', '隶变'], 廾: ['𠬞', '部首形（说文自注今變隸作廾）'],
  衛: ['衞', '俗字'], 寢: ['寑', '俗字'], 災: ['烖', '或体'],
  飮: ['㱃', '俗字'], 耋: ['耊', '俗字'], 函: ['圅', '隶变'],
  冏: ['囧', '或体'], 冉: ['冄', '俗字'], 乘: ['椉', '隶变'],
  並: ['竝', '隶变'], 柳: ['桺', '俗字'], 霰: ['䨷', '或体'],
  妍: ['姸', '俗字'], 姫: ['姬', '异体'], 匄: ['匃', '俗字'],
  尋: ['𢒫', '古文'], 爿: ['牀', '初文'], 參: ['曑', '隶变'],
  豪: ['𩫚', '隶变'],
}

const file = path.join(root, 'data/alias-overrides.json')
const existing = JSON.parse(fs.readFileSync(file, 'utf8'))
const present = new Set(existing.map((entry) => entry.from))

let added = 0
let skippedMissing = 0
for (const [from, [to, rel]] of Object.entries(CANDIDATES)) {
  if (present.has(from)) continue
  const rec = SW[to]
  if (rec === undefined) {
    skippedMissing++
    console.log(`SKIP ${from}→${to}: target not a 《说文》 headword`)
    continue
  }
  const orig = String(rec.e ?? '').replace(/\s+/g, '')
  const anchor = orig.length > 40 ? `${orig.slice(0, 40)}…` : orig
  existing.push({
    kind: 'headword',
    from,
    to,
    source: `《说文》${to}：${anchor}（${from}为${to}之${rel}）`,
    note: `${rel}对应，据《说文》字头核对；待甲骨学人工复核`,
  })
  present.add(from)
  added++
}

fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`)
console.log(`added=${added} skippedMissing=${skippedMissing} totalEntries=${existing.length}`)