// Recomputes the numbers in README.md from the judge verdicts in judge/ and the tables in table-*.json.
// Run: node check.mjs   (no network, no key)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const ok = (id) => id && /^[HM]-?\d+$/.test(id)
const strict = (v) => (v.a?.match && v.a.match === v.b?.match && ok(v.a.match) ? v.a.match : null)
const one = (v) => (ok(v.a?.match) ? v.a.match : ok(v.b?.match) ? v.b.match : null)
const distinct = (list, k, f) => new Set(list.slice(0, k).map(f).filter(Boolean)).size
let bad = 0
for (const run of ['lab-1', 'lab-2']) {
  const table = JSON.parse(fs.readFileSync(path.join(dir, 'table-' + run + '.json'), 'utf8'))
  const tot = { known: 0, hyps: 0, s15: 0, s30: 0, sAll: 0, o30: 0, oAll: 0 }
  for (const row of table) {
    const v = JSON.parse(fs.readFileSync(path.join(dir, 'judge', run, row.audit + '.json'), 'utf8')).verdicts
    const mine = { s15: distinct(v, 15, strict), s30: distinct(v, 30, strict), sAll: distinct(v, 1e3, strict), o30: distinct(v, 30, one), oAll: distinct(v, 1e3, one) }
    const same = v.length === row.hypotheses && mine.s15 === row.strict_top15 && mine.s30 === row.strict_top30 && mine.sAll === row.strict_all && mine.o30 === row.one_judge_top30 && mine.oAll === row.one_judge_all
    if (!same) { bad++; console.log('MISMATCH', run, row.audit, JSON.stringify(mine)) }
    tot.known += row.known_findings; tot.hyps += v.length
    for (const k of ['s15', 's30', 'sAll', 'o30', 'oAll']) tot[k] += mine[k]
  }
  console.log(run + ': contests ' + table.length + ', known findings ' + tot.known + ', hypotheses ' + tot.hyps)
  console.log('  strict: top 15 ' + tot.s15 + ', top 30 ' + tot.s30 + ', all ' + tot.sAll + ' of ' + tot.known)
  console.log('  one judge: top 30 ' + tot.o30 + ', all ' + tot.oAll + ' of ' + tot.known)
}
// The two runs together: a known finding counts once if either run found it strictly.
let union = 0
for (const row of JSON.parse(fs.readFileSync(path.join(dir, 'table-lab-1.json'), 'utf8'))) {
  const found = new Set()
  for (const run of ['lab-1', 'lab-2']) for (const v of JSON.parse(fs.readFileSync(path.join(dir, 'judge', run, row.audit + '.json'), 'utf8')).verdicts) { const s = strict(v); if (s) found.add(s) }
  union += found.size
}
console.log('both runs together: strict ' + union + ' of 105 (a finding found by both runs counts once)')
console.log(bad ? bad + ' contest(s) differ from the tables' : 'every contest matches the tables')
process.exit(bad ? 1 : 0)
