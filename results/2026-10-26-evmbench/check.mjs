// Recomputes the totals in README.md from the judge verdicts in judge/ and the table in evmbench-40.json.
// Run: node check.mjs   (no network, no key)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const table = JSON.parse(fs.readFileSync(path.join(dir, 'evmbench-40.json'), 'utf8'))
const ok = (id) => id && /^[HM]-?\d+$/.test(id)
const strict = (v) => (v.a?.match && v.a.match === v.b?.match && ok(v.a.match) ? v.a.match : null)
const one = (v) => (ok(v.a?.match) ? v.a.match : ok(v.b?.match) ? v.b.match : null)
const distinct = (list, k, f) => new Set(list.slice(0, k).map(f).filter(Boolean)).size
let bad = 0
const tot = { known: 0, s15: 0, s30: 0, sAll: 0, o30: 0, oAll: 0 }
for (const row of table) {
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'judge', row.audit + '.json'), 'utf8')).verdicts
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
process.exit(bad ? 1 : 0)
