// check.mjs: recomputes every count in table.json, totals.json and table-control.json from the verdict files in judge/ and control-raw-report/.
// Run: node check.mjs            (no network, no key)
//      node check.mjs <path to a clone of the Azimuth repository>   (also compares their scores with its RESULTS.tsv)
// The folder calibration-other-judges/ holds an earlier trial with two other judges and is not counted here.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const JA = 'ovh_gpt-oss-120b', JB = 'mistral_codestral-latest'
let bad = 0
const fail = (msg) => { bad++; console.log('MISMATCH', msg) }
const pct = (n, d) => (100 * n / d).toFixed(1) + ' percent'

function lees(map) {
  const per = {}
  let unreadable = 0, files = 0, other = 0
  for (const f of fs.readdirSync(path.join(HERE, map)).filter((x) => x.endsWith('.json')).sort()) {
    const [, audit, finding, judge] = f.replace('.json', '').split('__')
    if (judge !== JA && judge !== JB) { other++; continue }
    files++
    const o = JSON.parse(fs.readFileSync(path.join(HERE, map, f), 'utf8'))
    const m = String(o.tekst).match(/"detected"\s*:\s*(true|false)/)
    if (!m) unreadable++
    ;((per[audit] ??= {})[finding] ??= {})[judge] = m ? m[1] === 'true' : false
  }
  if (other > 0) fail(`${map} holds ${other} files of other judges`)
  return { per, unreadable, files }
}
function tel(per, audit) {
  const v = Object.values(per[audit] ?? {})
  return { known: v.length, gptOss: v.filter((x) => x[JA]).length, codestral: v.filter((x) => x[JB]).length, both: v.filter((x) => x[JA] && x[JB]).length, atLeastOne: v.filter((x) => x[JA] || x[JB]).length }
}

const main = lees('judge')
const table = JSON.parse(fs.readFileSync(path.join(HERE, 'table.json'), 'utf8'))
const totals = JSON.parse(fs.readFileSync(path.join(HERE, 'totals.json'), 'utf8'))
const sum = { audits: 0, known: 0, gptOss: 0, codestral: 0, both: 0, atLeastOne: 0, theirScore: 0 }
if (table.length !== Object.keys(main.per).length) fail('number of audits')
for (const row of table) {
  const calc = tel(main.per, row.audit)
  for (const k of Object.keys(calc)) if (calc[k] !== row[k]) fail(`${row.audit} ${k}: files say ${calc[k]}, table says ${row[k]}`)
  sum.audits++; for (const k of ['known', 'gptOss', 'codestral', 'both', 'atLeastOne', 'theirScore']) sum[k] += row[k]
}
for (const k of Object.keys(sum)) if (sum[k] !== totals[k]) fail(`total ${k}: rows say ${sum[k]}, totals.json says ${totals[k]}`)
if (main.unreadable !== totals.unreadableVerdicts) fail(`unreadable verdicts: files say ${main.unreadable}, totals.json says ${totals.unreadableVerdicts}`)
if (main.files !== totals.verdictFiles) fail('number of verdict files')
console.log(`${sum.audits} audits, ${sum.known} known findings, ${main.files} verdict files, ${main.unreadable} unreadable`)
console.log(`judge gpt-oss-120b: ${sum.gptOss} (${pct(sum.gptOss, sum.known)}) | judge codestral: ${sum.codestral} (${pct(sum.codestral, sum.known)}) | both judges: ${sum.both} (${pct(sum.both, sum.known)}) | at least one: ${sum.atLeastOne} (${pct(sum.atLeastOne, sum.known)}) | their own score: ${sum.theirScore} (${pct(sum.theirScore, sum.known)})`)

if (fs.existsSync(path.join(HERE, 'table-control.json'))) {
  const ctl = JSON.parse(fs.readFileSync(path.join(HERE, 'table-control.json'), 'utf8'))
  const c = lees('control-raw-report')
  if (c.files !== ctl.verdictFiles) fail('number of control verdict files')
  if (c.unreadable !== ctl.unreadableVerdicts) fail('unreadable control verdicts')
  let k = 0, a = 0, b = 0, both = 0, ma = 0, mb = 0, mboth = 0
  for (const row of ctl.rows) {
    const calc = tel(c.per, row.audit)
    for (const key of ['known', 'gptOss', 'codestral', 'both']) if (calc[key] !== row[key]) fail(`control ${row.audit} ${key}: files say ${calc[key]}, table says ${row[key]}`)
    const m = table.find((r) => r.audit === row.audit)
    k += row.known; a += row.gptOss; b += row.codestral; both += row.both
    ma += m.gptOss; mb += m.codestral; mboth += m.both
  }
  console.log(`control on the raw report file, ${ctl.rows.length} audits, ${k} known findings: gpt-oss ${a} (our rendering: ${ma}), codestral ${b} (${mb}), both ${both} (${mboth})`)
}

if (fs.existsSync(path.join(HERE, 'table-canonical.json'))) {
  // The copy of the benchmark's own grader (gpt-5, reasoning high) on the raw reports of 7 audits, against the grader answers kept in their run logs.
  const tc = JSON.parse(fs.readFileSync(path.join(HERE, 'table-canonical.json'), 'utf8'))
  const calc = {}
  let files = 0
  for (const f of fs.readdirSync(path.join(HERE, 'canonical-replica')).filter((x) => x.endsWith('.json')).sort()) {
    const [audit, id] = f.replace('.json', '').split('__')
    calc[audit + '__' + id] = JSON.parse(fs.readFileSync(path.join(HERE, 'canonical-replica', f), 'utf8')).detected
    files++
  }
  if (files !== tc.perFinding.length) fail('number of canonical-replica files')
  let replica = 0, theirs = 0, same = 0
  for (const r of tc.perFinding) {
    const v = calc[r.audit + '__' + r.finding]
    if (typeof v !== 'boolean' || v !== r.replica) fail('canonical ' + r.audit + ' ' + r.finding + ': file says ' + v + ', table says ' + r.replica)
    replica += r.replica ? 1 : 0; theirs += r.theirGrader ? 1 : 0; same += r.replica === r.theirGrader ? 1 : 0
  }
  const t = tc.totals
  if (replica !== t.replica || theirs !== t.theirScore || same !== t.sameVerdict || tc.perFinding.length !== t.known) fail('canonical totals')
  console.log('copy of the benchmark grader on ' + t.audits + ' audits, ' + t.known + ' known findings: replica ' + replica + ', their grader ' + theirs + ', the same verdict on ' + same + ' of ' + t.known + ' findings')
}

const argClone = process.argv[2]
if (argClone) {
  const tsv = Object.fromEntries(fs.readFileSync(path.join(argClone, 'RESULTS.tsv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((r) => { const [a, s, m] = r.split('\t'); return [a, [Number(s), Number(m)]] }))
  let theirAll = 0
  for (const r of table) if (!tsv[r.audit] || tsv[r.audit][0] !== r.theirScore || tsv[r.audit][1] !== r.known) fail(`${r.audit}: RESULTS.tsv says ${tsv[r.audit]}, table says ${r.theirScore} of ${r.known}`)
  for (const [, [s]] of Object.entries(tsv)) theirAll += s
  console.log(`RESULTS.tsv of the clone: ${theirAll} in all ${Object.keys(tsv).length} audits`)
  if (fs.existsSync(path.join(HERE, 'table-canonical.json'))) {
    const tc = JSON.parse(fs.readFileSync(path.join(HERE, 'table-canonical.json'), 'utf8'))
    for (const a of tc.perAudit) if (!tsv[a.audit] || tsv[a.audit][0] !== a.theirScore || tsv[a.audit][1] !== a.known) fail('canonical ' + a.audit + ': RESULTS.tsv says ' + tsv[a.audit] + ', table says ' + a.theirScore + ' of ' + a.known)
  }
}
console.log(bad === 0 ? 'every count matches the verdict files' : `${bad} mismatches`)
process.exit(bad === 0 ? 0 : 1)
