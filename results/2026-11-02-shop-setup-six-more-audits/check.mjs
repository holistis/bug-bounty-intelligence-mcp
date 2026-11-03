// check.mjs: recomputes every count in table.json from verdicts/, hypothesis-verdicts/ and known/, and the hashes in SHA256SUMS.
// Run: node check.mjs            (no network, no key)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const END = '__openai_gpt-5-high.json'
const table = JSON.parse(fs.readFileSync(path.join(HERE, 'table.json'), 'utf8'))
let bad = 0
let voided = 0
const fail = (m) => { bad++; console.log('MISMATCH', m) }
const okId = (id) => id && /^[HM]-?\d+$/.test(id)
const strictOf = (x) => okId(x.a?.match) && x.a.match === x.b?.match
const oneOf = (x) => okId(x.a?.match) || okId(x.b?.match)
const read = (...p) => JSON.parse(fs.readFileSync(path.join(HERE, ...p), 'utf8'))

// grader copy: one verdict file per known finding
const per = {}
let files = 0, unreadable = 0
for (const f of fs.readdirSync(path.join(HERE, 'verdicts')).filter((x) => x.endsWith(END)).sort()) {
  const [run, audit, finding] = f.slice(0, -END.length).split('__')
  files++
  const d = read('verdicts', f).detected
  if (typeof d !== 'boolean') unreadable++
  ;((per[run + '/' + audit] ??= { known: 0, ids: [] }).known++)
  if (d === true) per[run + '/' + audit].ids.push(finding)
}
// open judges: per hypothesis
const open = {}
let pH = 0, pStrict = 0, pOne = 0
const sl = { topFive: { hypotheses: 0, strict: 0, oneJudge: 0 }, highConfidence: { hypotheses: 0, strict: 0, oneJudge: 0 } }
for (const r of table.precision.rows) {
  const v = read('hypothesis-verdicts', r.run + '__' + r.audit + '.json').verdicts
  for (const x of v) for (const j of [x.a, x.b]) if (j?.ongeldig) voided++
  const h = read('hypotheses', r.run + '__' + r.audit + '.json').hypotheses
  if (v.length !== h.length || h.length !== r.hypotheses) fail(r.run + ' ' + r.audit + ' hypotheses')
  const strict = v.filter(strictOf), one = v.filter(oneOf)
  const strictIds = new Set(strict.map((x) => x.a.match)), oneIds = new Set(v.flatMap((x) => [x.a?.match, x.b?.match]).filter(okId))
  open[r.run + '/' + r.audit] = { strictIds: [...strictIds].sort(), oneIds: oneIds.size }
  if (strict.length !== r.strictMatchingHypotheses || one.length !== r.oneJudgeMatchingHypotheses) fail(r.run + ' ' + r.audit + ' matching hypotheses')
  if (strictIds.size !== r.strictKnownFound || oneIds.size !== r.oneJudgeKnownFound) fail(r.run + ' ' + r.audit + ' known findings matched')
  if (r.primary) {
    h.forEach((x, i) => {
      if (i < 5) { sl.topFive.hypotheses++; if (strictOf(v[i])) sl.topFive.strict++; if (oneOf(v[i])) sl.topFive.oneJudge++ }
      if (Number(x.confidence) > 0.5) { sl.highConfidence.hypotheses++; if (strictOf(v[i])) sl.highConfidence.strict++; if (oneOf(v[i])) sl.highConfidence.oneJudge++ }
    })
    pH += h.length; pStrict += strict.length; pOne += one.length
  }
}
const G = { known: 0, found: 0 }, O = { known: 0, found: 0, foundOneJudge: 0 }
let judged = 0
for (const r of table.rows) {
  const key = r.run + '/' + r.audit
  if (!fs.existsSync(path.join(HERE, 'reports', r.run + '__' + r.audit + '.md'))) fail('report missing ' + r.audit)
  if (r.judge === 'grader-copy') {
    const p = per[key] ?? { known: 0, ids: [] }
    judged += p.known
    if (p.known !== r.known || p.ids.length !== r.found || p.ids.join(',') !== r.foundIds.join(',')) fail(key + ' grader copy ' + p.ids.join(','))
    if (r.primary) { G.known += p.known; G.found += p.ids.length }
  } else {
    const k = read('known', r.audit + '.json').length
    if (k !== r.known) fail(key + ' known ' + k + ' vs ' + r.known)
    if (open[key].strictIds.length !== r.found || open[key].strictIds.join(',') !== r.foundIds.join(',') || open[key].oneIds !== r.foundOneJudge) fail(key + ' open judges found')
  }
  if (r.primary) { O.known += r.known; O.found += open[key].strictIds.length; O.foundOneJudge += open[key].oneIds }
}
if (files !== judged) fail('verdict files ' + files + ' vs ' + judged)
if (G.known !== table.totals.graderCopy.known || G.found !== table.totals.graderCopy.found) fail('grader copy totals ' + G.found + ' of ' + G.known)
if (O.known !== table.totals.openJudges.known || O.found !== table.totals.openJudges.found || O.foundOneJudge !== table.totals.openJudges.foundOneJudge) fail('open judge totals ' + O.found + ' of ' + O.known)
for (const x of table.repeat) if ((per['kn1/' + x.audit]?.ids.length) !== x.firstRunFound || (per['kn2/' + x.audit]?.ids.length) !== x.repeatRunFound) fail('repeat ' + x.audit)
const byRun = {}
for (const r of table.precision.rows.filter((x) => x.primary)) {
  const v = read('hypothesis-verdicts', r.run + '__' + r.audit + '.json').verdicts
  const h = read('hypotheses', r.run + '__' + r.audit + '.json').hypotheses
  const b = (byRun[r.run] ??= { hypotheses: 0, strict: 0, topFive: { hypotheses: 0, strict: 0 }, highConfidence: { hypotheses: 0, strict: 0 } })
  h.forEach((x, i) => { b.hypotheses++; const s = strictOf(v[i]); if (s) b.strict++; if (i < 5) { b.topFive.hypotheses++; if (s) b.topFive.strict++ } if (Number(x.confidence) > 0.5) { b.highConfidence.hypotheses++; if (s) b.highConfidence.strict++ } })
}
if (JSON.stringify(byRun) !== JSON.stringify(table.precision.byRun)) fail('precision by run')
const T = table.precision.totals
if (pH !== T.hypotheses || pStrict !== T.strictMatchingHypotheses || pOne !== T.oneJudgeMatchingHypotheses) fail('precision totals ' + pStrict + ' of ' + pH)
for (const k of ['topFive', 'highConfidence']) for (const f of ['hypotheses', 'strict', 'oneJudge']) if (sl[k][f] !== table.precision.slices[k][f]) fail(k + ' ' + f)
for (const line of fs.readFileSync(path.join(HERE, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean)) {
  const [hash, ...rest] = line.split(/\s+/)
  const file = rest.join(' ').replace(/^\*/, '')
  if (crypto.createHash('sha256').update(fs.readFileSync(path.join(HERE, file))).digest('hex') !== hash) fail('hash ' + file)
}
console.log(bad === 0
  ? 'all counts and hashes match (grader copy ' + G.found + ' of ' + G.known + ' on the four small audits; open judges, strict, ' + O.found + ' of ' + O.known + ' on all six; precision ' + pStrict + ' of ' + pH + ' strict; first five ' + sl.topFive.strict + ' of ' + sl.topFive.hypotheses + '; confidence above 0.5 ' + sl.highConfidence.strict + ' of ' + sl.highConfidence.hypotheses + '; ' + files + ' verdict files, ' + unreadable + ' unreadable; ' + voided + ' open-judge answers with an unknown id counted as no match)'
  : bad + ' mismatches')
process.exitCode = bad === 0 ? 0 : 1
