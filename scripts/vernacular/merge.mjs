/**
 * Merge authored vernacular drafts into data/vernacular-overrides.json (D18).
 *
 * Drafts live in scripts/vernacular/drafts/*.json, each a flat
 * { headword: oneSentenceParaphrase } map authored from the verified 《说文》
 * original. This script validates every key against the shipped headword table
 * and every value as a non-empty string, then writes the merged override file.
 * The override file is the human product the extractor merges (and never
 * overwrites); re-running this script is idempotent.
 *
 * Usage: node scripts/vernacular/merge.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const oracle = JSON.parse(fs.readFileSync(path.join(root, 'data/oracle.json'), 'utf8'))
const headwords = new Set(Object.keys(oracle.headwords))

const draftsDir = path.join(root, 'scripts/vernacular/drafts')
const files = fs.existsSync(draftsDir)
  ? fs.readdirSync(draftsDir).filter((f) => f.endsWith('.json')).sort()
  : []

const merged = {}
const unknown = []
const empty = []
let total = 0
for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(draftsDir, file), 'utf8'))
  for (const [headword, text] of Object.entries(batch)) {
    total++
    if (!headwords.has(headword)) {
      unknown.push(`${file}: ${headword}`)
      continue
    }
    if (typeof text !== 'string' || text.trim().length === 0) {
      empty.push(`${file}: ${headword}`)
      continue
    }
    merged[headword] = text.trim()
  }
}

const out = path.join(root, 'data/vernacular-overrides.json')
fs.writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`)
console.log(`draftFiles=${files.length} entries=${total} merged=${Object.keys(merged).length}`)
console.log(`headwords=${headwords.size} coverage=${((Object.keys(merged).length / headwords.size) * 100).toFixed(1)}%`)
if (unknown.length > 0) console.log(`UNKNOWN keys (${unknown.length}):\n${unknown.join('\n')}`)
if (empty.length > 0) console.log(`EMPTY values (${empty.length}):\n${empty.join('\n')}`)
const missing = [...headwords].filter((h) => !(h in merged))
console.log(`stillMissing=${missing.length}`)
