// check.mjs: recomputes every count in table.json from the verdict files, the hypotheses and the answer key, and checks the hashes in SHA256SUMS (computed on the text with line endings converted to LF, so a checkout on any system gives the same result).
// Run: node check.mjs            (no network, no key)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const END = '__openai_gpt-5-high.json'
const read = (...p) => JSON.parse(fs.readFileSync(path.join(HERE, ...p), 'utf8'))
const table = read('table.json')
let bad = 0
let voided = 0
const fail = (m) => { bad++; console.log('MISMATCH', m) }
const okId = (id) => id && /^[HM]-?\d+$/.test(id)
const strictOf = (x) => okId(x.a?.match) && x.a.match === x.b?.match
const oneOf = (x) => okId(x.a?.match) || okId(x.b?.match)

// the answer key: known/ must be exactly the inserted bugs listed in mutations/
for (const set of Object.keys(table.sources)) {
  const k = read('known', set + '.json'), m = read('mutations', set + '.json').mutations
  if (k.length !== m.length || k.some((x, i) => x.id !== m[i].id || x.title !== m[i].title || x.description !== m[i].description)) fail('answer key ' + set)
}
// grader copy: one verdict file per injected bug
const per = {}
let files = 0, unreadable = 0
for (const f of fs.readdirSync(path.join(HERE, 'verdicts')).filter((x) => x.endsWith(END)).sort()) {
  const [run, audit, finding] = f.slice(0, -END.length).split('__')
  files++
  const d = read('verdicts', f).detected
  if (typeof d !== 'boolean') unreadable++
  ;((per[audit] ??= { known: 0, ids: [] }).known++)
  if (d === true) per[audit].ids.push(finding)
}
const T = { injectedBugs: 0, graderCopyFound: 0, openJudgesStrictFound: 0, openJudgesOneFound: 0, mutRunHypotheses: 0, mutRunStrictMatchingHypotheses: 0, controlHypotheses: 0, controlStrictMatches: 0, controlOneJudgeMatches: 0 }
const sl = { topFive: { hypotheses: 0, strict: 0 }, highConfidence: { hypotheses: 0, strict: 0 } }
for (const r of table.rows) {
  const v = read('hypothesis-verdicts', r.run + '__' + r.audit + '.json').verdicts
  for (const x of v) for (const j of [x.a, x.b]) if (j?.ongeldig) voided++
  const h = read('hypotheses', r.run + '__' + r.audit + '.json').hypotheses
  if (v.length !== h.length || h.length !== r.hypotheses) fail(r.audit + ' hypotheses')
  if (!fs.existsSync(path.join(HERE, 'reports', r.run + '__' + r.audit + '.md'))) fail('report missing ' + r.audit)
  const strict = v.filter(strictOf), one = v.filter(oneOf)
  const sIds = new Set(strict.map((x) => x.a.match)), oIds = new Set(v.flatMap((x) => [x.a?.match, x.b?.match]).filter(okId))
  if (strict.length !== r.strictMatchingHypotheses || one.length !== r.oneJudgeMatchingHypotheses || sIds.size !== r.strictKnownFound || oIds.size !== r.oneJudgeKnownFound) fail(r.audit + ' open judges')
  if (r.kind === 'mut') {
    const p = per[r.audit] ?? { known: 0, ids: [] }
    if (p.known !== r.known || p.known !== read('known', r.set + '.json').length) fail(r.audit + ' known')
    if (p.ids.length !== r.graderCopyFound || p.ids.join(',') !== r.graderCopyIds.join(',')) fail(r.audit + ' grader copy')
    T.injectedBugs += p.known; T.graderCopyFound += p.ids.length; T.openJudgesStrictFound += sIds.size; T.openJudgesOneFound += oIds.size
    T.mutRunHypotheses += h.length; T.mutRunStrictMatchingHypotheses += strict.length
    h.forEach((x, i) => { if (i < 5) { sl.topFive.hypotheses++; if (strictOf(v[i])) sl.topFive.strict++ } if (Number(x.confidence) > 0.5) { sl.highConfidence.hypotheses++; if (strictOf(v[i])) sl.highConfidence.strict++ } })
  } else { T.controlHypotheses += h.length; T.controlStrictMatches += strict.length; T.controlOneJudgeMatches += one.length }
}
const typeOf = {}
for (const set of Object.keys(table.sources)) for (const x of read('mutations', set + '.json').mutations) typeOf[set + ':' + x.id] = x.type
const bc = { access: { injected: 0, graderFound: 0, strictFound: 0 }, check: { injected: 0, graderFound: 0, strictFound: 0 }, compare: { injected: 0, graderFound: 0, strictFound: 0 } }
for (const r of table.rows.filter((x) => x.kind === 'mut')) {
  const v = read('hypothesis-verdicts', r.run + '__' + r.audit + '.json').verdicts
  for (const [k, ty] of Object.entries(typeOf)) if (k.startsWith(r.set + ':')) bc[ty].injected++
  per[r.audit].ids.forEach((id) => bc[typeOf[r.set + ':' + id]].graderFound++)
  new Set(v.filter(strictOf).map((x) => x.a.match)).forEach((id) => bc[typeOf[r.set + ':' + id]].strictFound++)
}
if (JSON.stringify(bc) !== JSON.stringify(table.byClass)) fail('by kind of bug')
for (const k of Object.keys(T)) if (T[k] !== table.totals[k]) fail('total ' + k + ' ' + T[k] + ' vs ' + table.totals[k])
for (const k of ['topFive', 'highConfidence']) for (const f of ['hypotheses', 'strict']) if (sl[k][f] !== table.slices[k][f]) fail(k + ' ' + f)
for (const line of fs.readFileSync(path.join(HERE, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean)) {
  const [hash, ...rest] = line.split(/\s+/)
  const file = rest.join(' ').replace(/^\*/, '')
  if (crypto.createHash('sha256').update(Buffer.from(fs.readFileSync(path.join(HERE, file), 'utf8').replace(/\r\n/g, '\n'))).digest('hex') !== hash) fail('hash ' + file)
}
console.log(bad === 0
  ? 'all counts and hashes match (' + T.injectedBugs + ' injected bugs: grader copy ' + T.graderCopyFound + ', open judges strict ' + T.openJudgesStrictFound + ', either ' + T.openJudgesOneFound + '; controls ' + T.controlStrictMatches + ' strict matches in ' + T.controlHypotheses + ' hypotheses; first five ' + sl.topFive.strict + ' of ' + sl.topFive.hypotheses + '; ' + files + ' verdict files, ' + unreadable + ' unreadable; ' + voided + ' open-judge answers with an unknown id counted as no match)'
  : bad + ' mismatches')
process.exitCode = bad === 0 ? 0 : 1
