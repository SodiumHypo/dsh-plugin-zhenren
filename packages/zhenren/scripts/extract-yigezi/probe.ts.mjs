// Temporary: inspect TS coverage for common simplified chars.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../../..')
const html = fs.readFileSync(path.join(ROOT, '.refs/yigezi-main/index.html'), 'utf8')

function extractObjectAt(at, name) {
  const marker = `${name}={`
  const idx = html.indexOf(marker, at)
  if (idx < 0) throw new Error(`no ${name}`)
  const start = idx + marker.length - 1
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return { value: JSON.parse(html.slice(start, i + 1)), end: i } }
  }
  throw new Error(`unterminated ${name}`)
}

const sw = extractObjectAt(0, 'SW')
const ts = extractObjectAt(sw.end, 'TS')
const SW = sw.value
const TS = ts.value
const tests = ['贞', '为', '万', '于', '明', '声', '复', '弃', '鸡', '云', '协', '吕', '沈', '胶', '蛊', '张', '刘', '陈', '国', '语', '说', '学', '时', '门', '问', '见', '车', '马', '鸟', '鱼', '龙', '风', '雨', '电', '东', '西', '南', '北', '天', '地', '人', '王', '女', '子', '日', '月', '水', '火', '山', '木', '金', '土', '卜', '龟', '骨', '甲', '占', '吉', '凶', '福', '祸']
for (const t of tests) console.log(t, 'SW?', Boolean(SW[t]), 'TS?', JSON.stringify(TS[t] ?? null))
