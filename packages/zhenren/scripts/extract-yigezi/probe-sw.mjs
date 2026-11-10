// Temporary: inspect 说文 records for the documented headword mappings.
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

const SW = extractObjectAt(0, 'SW').value
const pairs = [['亡', '亾'], ['以', '㠯'], ['年', '秊'], ['春', '萅'], ['宜', '宐'], ['于', '亏']]
for (const [a, b] of pairs) {
  const ra = SW[a]
  const rb = SW[b]
  console.log(`=== ${a} / ${b} ===`)
  console.log(`  SW[${a}]:`, ra ? JSON.stringify({ e: ra.e, r: ra.r, w: ra.w }) : 'absent')
  console.log(`  SW[${b}]:`, rb ? JSON.stringify({ e: rb.e, r: rb.r, w: rb.w }) : 'absent')
}
