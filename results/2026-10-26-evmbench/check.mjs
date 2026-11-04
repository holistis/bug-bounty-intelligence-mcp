// Recomputes the totals in README.md from the judge verdicts in judge/ and the table in evmbench-40.json.
// Run: node check.mjs   (no network, no key)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const table = JSON.parse(fs.readFileSync(path.join(dir, 'evmbench-40.json'), 'utf8'))
const ok = (id) => id && /^[HM]-?\d+$/.test(id)
const strict = (v) => (v.a?.match && v.a.match === v.b?.match && ok(v.a.match) ? v.a.match : null)
const one = (v) => (ok(v.a?.match) ? v.a.match : ok(v.b?.match) ? v.b.match : null)
const distinct = (list, k, f) => new Set(list.slice(0, k).map(f).filter(Boolean)).size
const registry = JSON.parse(fs.readFileSync(path.join(dir, 'known-finding-ids.json'), 'utf8'))
let bad = 0
const tot = { known: 0, s15: 0, s30: 0, sAll: 0, o30: 0, oAll: 0 }
for (const row of table) {
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'judge', row.audit + '.json'), 'utf8')).verdicts
  const rijen = v.map((x) => JSON.stringify(x))
  if (new Set(rijen).size !== rijen.length) { bad++; console.log('MISMATCH', row.audit, 'a verdict row appears twice') }
  const ids = registry.audits[row.audit]
  if (!Array.isArray(ids) || ids.length !== row.known_findings ||
      new Set(ids).size !== ids.length) {
    bad++
    console.log('MISMATCH', row.audit, 'canonical registry')
  }
  const known = new Set(Array.isArray(ids) ? ids : [])
  for (const [index, verdict] of v.entries()) {
    for (const judge of ['a', 'b']) {
      const id = verdict[judge]?.match
      if (id != null && !known.has(id)) {
        bad++
        console.log('MISMATCH', row.audit,
          'unknown finding ID', id,
          'hypothesis', index + 1, 'judge', judge)
      }
    }
  }
  const mine = { s15: distinct(v, 15, strict), s30: distinct(v, 30, strict), sAll: distinct(v, 1e3, strict), o30: distinct(v, 30, one), oAll: distinct(v, 1e3, one) }
  const same = mine.s15 === row.strict_top15 && mine.s30 === row.strict_top30 && mine.sAll === row.strict_all && mine.o30 === row.one_judge_top30 && mine.oAll === row.one_judge_all
  if (!same) { bad++; console.log('MISMATCH', row.audit, JSON.stringify(mine)) }
  tot.known += row.known_findings
  for (const k of Object.keys(mine)) tot[k] += mine[k]
}
console.log(`audits ${table.length}, known findings ${tot.known}`)
console.log(`strict: top 15 ${tot.s15}, top 30 ${tot.s30}, all ${tot.sAll} of ${tot.known}`)
console.log(`one judge: top 30 ${tot.o30}, all ${tot.oAll} of ${tot.known}`)
console.log(bad ? `${bad} audit(s) differ from the table` : 'every audit matches the table')
// The hash list must exist, list files and match them. An emptied list used to pass here (found 4 Nov 2026 with a planted empty list).
{
  const sums = path.join(dir, 'SHA256SUMS')
  const lines = fs.existsSync(sums) ? fs.readFileSync(sums, 'utf8').split('\n').filter(Boolean) : []
  if (lines.length === 0) { bad++; console.log('MISMATCH SHA256SUMS is missing or empty') }
  for (const line of lines) {
    const [hash, ...rest] = line.split(/\s+/)
    const file = rest.join(' ').replace(/^\*/, '')
    const f = path.join(dir, file)
    if (!fs.existsSync(f) || crypto.createHash('sha256').update(Buffer.from(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'))).digest('hex') !== hash) { bad++; console.log('MISMATCH hash', file) }
  }
}
process.exit(bad ? 1 : 0)
