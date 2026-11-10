// Temporary: diff font cmap against HAS_ORAC.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fk from 'fontkit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../../..')
const html = fs.readFileSync(path.join(ROOT, '.refs/yigezi-main/index.html'), 'utf8')

function extractBacktick(name) {
  const marker = `${name}=`
  const at = html.indexOf(marker)
  const q = html.indexOf('`', at + marker.length)
  const end = html.indexOf('`', q + 1)
  return html.slice(q + 1, end)
}
const hasOrac = [...new Set(extractBacktick('HAS_ORAC'))]
const font = (fk.openSync ?? fk.default.openSync)(path.join(ROOT, '.refs/yigezi-main/orac.woff2'))
const cmapChars = [...new Set(font.characterSet.map(cp => String.fromCodePoint(cp)))]
const a = new Set(hasOrac)
const b = new Set(cmapChars)
const onlyFont = cmapChars.filter(c => !a.has(c))
const onlyOrac = hasOrac.filter(c => !b.has(c))
console.log('HAS_ORAC', a.size, 'font cmap', b.size)
console.log('only in font:', onlyFont.length, JSON.stringify(onlyFont.map(c => `${c} U+${c.codePointAt(0).toString(16)}`)))
console.log('only in HAS_ORAC:', onlyOrac.length, JSON.stringify(onlyOrac))
