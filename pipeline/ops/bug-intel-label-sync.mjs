#!/usr/bin/env node
/**
 * Poort 5 van de leerlus: de uitslag van een ingediende bevinding wordt vanzelf een label voor de scan.
 *
 * Een bevinding in knowledge/findings.json die uit een scan komt, krijgt twee extra velden:
 *   "scan_job_id": "bi-...",  "scan_finding_id": 0
 * Zodra de `status` van die bevinding een uitslag is, zet dit script er een label van in data/bug-intel-labels.jsonl
 * (hetzelfde formaat als bug-intel-label.mjs). Idempotent: een bestaand label wordt nooit dubbel of anders geschreven.
 *
 *   node scripts/bug-intel-label-sync.mjs --findings <pad naar findings.json>            toon wat er zou gebeuren
 *   node scripts/bug-intel-label-sync.mjs --findings <pad naar findings.json> --schrijf  schrijf de labels
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const GELDIG = new Set(['ACCEPTED', 'PAID', 'CONFIRMED', 'VALID', 'TRIAGED_VALID', 'RESOLVED', 'FIXED', 'DUPLICATE'])
const ONGELDIG = new Set(['REJECTED', 'AFGEWEZEN_NOT_APPLICABLE', 'NOT_APPLICABLE', 'FALSE_POSITIVE', 'INFORMATIONAL', 'INFORMATIVE_NO_BOUNTY'])
const CAT_PATTERN = { SETTLEMENT: 'oracle-manipulation', ORDERING: 'reentrancy', ACCOUNTING: 'rounding', ACCESS: 'access-control', SOLVENCY: 'liquidation', LIVENESS: 'dos-griefing' }

/** Uitslag naar label, of null als het (nog) geen uitslag is. DUPLICATE telt als geldig: de fout bestond echt. */
export function statusNaarLabel(status) {
  const s = String(status ?? '').toUpperCase()
  if (GELDIG.has(s)) return 'valid'
  if (ONGELDIG.has(s) || s.startsWith('ELIMINATED_')) return 'false-positive'
  return null
}

/**
 * Zuivere kern. `findings`: de lijst uit findings.json. `jobs`: regels uit bug-intel-learning.jsonl.
 * `labels`: bestaande labels. Geeft { nieuw: [...], overgeslagen: [{id, reden}] }.
 */
export function bepaalLabels(findings, jobs, labels, nu = Date.now()) {
  const nieuw = [], overgeslagen = []
  const jobPerId = new Map()
  for (const r of jobs) jobPerId.set(r.jobId, Object.assign(jobPerId.get(r.jobId) ?? {}, r))
  const bestaand = new Map(labels.map(l => [`${l.jobId}#${l.findingId}`, l.label]))
  for (const f of findings) {
    if (f.scan_job_id == null || f.scan_finding_id == null) continue
    const label = statusNaarLabel(f.status)
    if (!label) { overgeslagen.push({ id: f.id, reden: `status ${f.status} is nog geen uitslag` }); continue }
    const job = jobPerId.get(f.scan_job_id)
    if (!job) { overgeslagen.push({ id: f.id, reden: `scan ${f.scan_job_id} niet in het logboek` }); continue }
    const fid = Number(f.scan_finding_id)
    const bevinding = (job.findings ?? []).find(x => x.id === fid)
    if (!bevinding) { overgeslagen.push({ id: f.id, reden: `bevinding ${fid} niet in scan ${f.scan_job_id}` }); continue }
    const sleutel = `${f.scan_job_id}#${fid}`
    if (bestaand.has(sleutel)) {
      overgeslagen.push({ id: f.id, reden: bestaand.get(sleutel) === label ? 'al gelabeld' : `al gelabeld als ${bestaand.get(sleutel)}, wordt niet overschreven` })
      continue
    }
    nieuw.push({
      ts: nu, jobId: f.scan_job_id, findingId: fid, title: bevinding.title, severity: bevinding.severity, category: bevinding.category,
      pattern: CAT_PATTERN[bevinding.category] ?? String(bevinding.category ?? 'onbekend').toLowerCase(),
      protocolType: job.protocolType ?? 'GENERAL', label, bron: `findings.json ${f.id} (${f.status})`,
    })
    bestaand.set(sleutel, label)
  }
  return { nieuw, overgeslagen }
}

const leesJsonl = (p) => existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : []

if (process.argv[1] && process.argv[1].endsWith('bug-intel-label-sync.mjs')) {
  const HERE = dirname(fileURLToPath(import.meta.url))
  const DATA = process.env.BUG_INTEL_DATA_DIR ?? join(HERE, '..', 'data')
  const i = process.argv.indexOf('--findings')
  if (i < 0 || !process.argv[i + 1]) { console.error('gebruik: --findings <pad> [--schrijf]'); process.exit(2) }
  const raw = JSON.parse(readFileSync(process.argv[i + 1], 'utf8'))
  const findings = Array.isArray(raw) ? raw : (raw.findings ?? Object.values(raw))
  const r = bepaalLabels(findings, leesJsonl(join(DATA, 'bug-intel-learning.jsonl')), leesJsonl(join(DATA, 'bug-intel-labels.jsonl')))
  const gekoppeld = findings.filter(f => f.scan_job_id != null).length
  console.log(`${findings.length} bevindingen, ${gekoppeld} met een scan-koppeling, ${r.nieuw.length} nieuwe labels, ${r.overgeslagen.length} overgeslagen`)
  r.nieuw.forEach(n => console.log(`  + ${n.jobId} #${n.findingId} -> ${n.label} (${n.pattern})  [${n.bron}]`))
  r.overgeslagen.forEach(o => console.log(`  - ${o.id}: ${o.reden}`))
  if (process.argv.includes('--schrijf') && r.nieuw.length) {
    for (const n of r.nieuw) appendFileSync(join(DATA, 'bug-intel-labels.jsonl'), JSON.stringify(n) + '\n')
    console.log(`${r.nieuw.length} label(s) geschreven; de learner pakt ze bij de volgende run op.`)
  }
}
