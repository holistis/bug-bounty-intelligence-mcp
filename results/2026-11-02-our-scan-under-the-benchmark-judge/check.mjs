// check.mjs: recomputes every count in table.json from the verdict files in verdicts/ and the hashes in SHA256SUMS.
// Run: node check.mjs            (no network, no key)
// A verdict file is named <source>__<audit>__<finding>__openai_gpt-5-high.json and holds the judge's answer for one known finding against one report.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCES = ['azimuth-raw', 'ag12', 'ag15', 'ag16']
const SHOP = { or2: '2024-12-secondswap', or3: '2024-06-size', or5: '2024-08-phi', or6: '2023-10-nextgen' }
const END = '__openai_gpt-5-high.json'
let bad = 0
const fail = (m) => { bad++; console.log('MISMATCH', m) }
const pct = (n, d) => (100 * n / d).toFixed(1) + ' percent'

const per = {}
let files = 0, unreadable = 0
for (const f of fs.readdirSync(path.join(HERE, 'verdicts')).filter((x) => x.endsWith(END)).sort()) {
  const [source, audit, finding] = f.slice(0, -END.length).split('__')
  if (!SOURCES.includes(source) && !SHOP[source]) { fail('unknown source in ' + f); continue }
  files++
  const v = JSON.parse(fs.readFileSync(path.join(HERE, 'verdicts', f), 'utf8')).detected
  if (typeof v !== 'boolean') unreadable++
  ;((per[audit] ??= {})[finding] ??= {})[source] = v === true
}
const rows = Object.keys(per).sort().map((audit) => {
  const ids = Object.keys(per[audit]).sort()
  const row = { audit, known: ids.length }
  for (const s of SOURCES) row[s] = ids.filter((id) => per[audit][id][s]).length
  return row
})
const shop = Object.entries(SHOP).map(([src, audit]) => ({ source: src, audit, known: Object.keys(per[audit]).length, found: Object.values(per[audit]).filter((x) => x[src]).length }))
const forte = { audit: '2025-04-forte', known: Object.keys(per['2025-04-forte']).length, found: 0, note: 'the run was stopped by our cost cap before it delivered a report, so it is counted as zero' }
const sum = (xs, k) => xs.reduce((n, x) => n + x[k], 0)
const auditsShop = [...Object.values(SHOP), forte.audit]
const onShopAudits = (s) => rows.filter((r) => auditsShop.includes(r.audit)).reduce((n, r) => n + r[s], 0)
const shopRoute = { rows: shop, forte, found: sum(shop, 'found'), known: sum(shop, 'known') + forte.known, foundWhereFinished: sum(shop, 'found'), knownWhereFinished: sum(shop, 'known'), sameAuditsLeader: onShopAudits('azimuth-raw'), sameAuditsOneResearchRun: onShopAudits('ag12') }
const entries = {}
for (const s of SOURCES.filter((x) => x !== 'azimuth-raw')) entries[s] = fs.readdirSync(path.join(HERE, 'reports')).filter((f) => f.startsWith(s + '__')).reduce((n, f) => n + fs.readFileSync(path.join(HERE, 'reports', f), 'utf8').split('\n').filter((l) => l.startsWith('## ')).length, 0)
const totals = { audits: rows.length, known: 0, verdictFiles: files, unreadableVerdicts: unreadable, reportEntries: entries, shopRoute }
for (const s of SOURCES) totals[s] = 0
for (const r of rows) { totals.known += r.known; for (const s of SOURCES) totals[s] += r[s] }
const notes = { shares: Object.fromEntries(SOURCES.map((s) => [s, pct(totals[s], totals.known)])), leaderReportEntries: { count: 174, note: 'headings starting with ## in the leader audit.md of these 7 audits, counted by us from their file, not recomputed by check.mjs', repository: 'testmachine-ai/azimuth-evmbench-101-of-117' }, judgeCopyChecked: 'results/2026-11-01-same-reports-different-judges', shopRouteShares: { all: pct(shopRoute.found, shopRoute.known), whereFinished: pct(shopRoute.foundWhereFinished, shopRoute.knownWhereFinished) }, leaderOwnGrader: { found: 26, note: 'the count of the benchmark grader itself on these 7 audits, from their run log as quoted in the 2026-11-01 folder, not recomputed by check.mjs' } }

if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(HERE, 'table.json'), JSON.stringify({ rows, totals, notes }, null, 2) + '\n')
  console.log('table.json written')
} else {
  const t = JSON.parse(fs.readFileSync(path.join(HERE, 'table.json'), 'utf8'))
  if (JSON.stringify(t.rows) !== JSON.stringify(rows)) fail('rows differ from the verdict files')
  if (JSON.stringify(t.totals) !== JSON.stringify(totals)) fail('totals differ from the verdict files')
  if (JSON.stringify(t.notes.shares) !== JSON.stringify(notes.shares)) fail('shares differ')
  if (JSON.stringify(t.notes.shopRouteShares) !== JSON.stringify(notes.shopRouteShares)) fail('shop route shares differ')
}
if (fs.readFileSync(path.join(HERE, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean).length === 0) fail('SHA256SUMS is empty: an emptied hash list checks nothing')
for (const line of fs.readFileSync(path.join(HERE, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean)) {
  const [hash, file] = line.split(/\s+\*?/)
  const p = path.join(HERE, file)
  if (!fs.existsSync(p)) { fail('missing ' + file); continue }
  if (crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') !== hash) fail('hash ' + file)
}
console.log(`${totals.audits} audits, ${totals.known} known findings (all High), ${files} verdict files, ${unreadable} unreadable`)
for (const s of SOURCES) console.log(`${s.padEnd(12)} ${String(totals[s]).padStart(2)} of ${totals.known} (${pct(totals[s], totals.known)})`)
console.log(bad ? `${bad} MISMATCH` : 'all counts and hashes match')
process.exit(bad ? 1 : 0)
