// check.mjs: recomputes every count in table.json from the verdict files in verdicts/ and the hashes in SHA256SUMS.
// Run: node check.mjs            (no network, no key)
// A verdict file is named <run>__<audit>__<finding>__openai_gpt-5-high.json and holds the judge's answer for one known finding against one report.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const END = '__openai_gpt-5-high.json'
const table = JSON.parse(fs.readFileSync(path.join(HERE, 'table.json'), 'utf8'))
let bad = 0
const fail = (m) => { bad++; console.log('MISMATCH', m) }
const per = {}
let files = 0, unreadable = 0
for (const f of fs.readdirSync(path.join(HERE, 'verdicts')).filter((x) => x.endsWith(END)).sort()) {
  const [run, audit, finding] = f.slice(0, -END.length).split('__')
  files++
  const v = JSON.parse(fs.readFileSync(path.join(HERE, 'verdicts', f), 'utf8')).detected
  if (typeof v !== 'boolean') unreadable++
  ;((per[run + '/' + audit] ??= { known: 0, ids: [] }).known++)
  if (v === true) per[run + '/' + audit].ids.push(finding)
}
let known = 0, found = 0
for (const r of table.rows) {
  const p = per[r.run + '/' + r.audit] ?? { known: 0, ids: [] }
  if (p.known !== r.known) fail(r.audit + ' known ' + p.known + ' vs table ' + r.known)
  if (p.ids.length !== r.found) fail(r.audit + ' found ' + p.ids.length + ' vs table ' + r.found)
  if (p.ids.join(',') !== r.foundIds.join(',')) fail(r.audit + ' ids ' + p.ids.join(',') + ' vs table ' + r.foundIds.join(','))
  known += p.known; found += p.ids.length
  if (!fs.existsSync(path.join(HERE, 'reports', r.run + '__' + r.audit + '.md'))) fail('report missing for ' + r.audit)
}
if (known !== table.totals.known) fail('total known ' + known + ' vs ' + table.totals.known)
if (found !== table.totals.found) fail('total found ' + found + ' vs ' + table.totals.found)
if (files !== known) fail('verdict files ' + files + ' vs known ' + known)
for (const line of fs.readFileSync(path.join(HERE, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean)) {
  const [hash, ...rest] = line.split(/\s+/)
  const file = rest.join(' ').replace(/^\*/, '')
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(HERE, file))).digest('hex')
  if (h !== hash) fail('hash ' + file)
}
console.log(bad === 0 ? 'all counts and hashes match (' + found + ' of ' + known + ', ' + files + ' verdict files, ' + unreadable + ' unreadable)' : bad + ' mismatches')
process.exitCode = bad === 0 ? 0 : 1
