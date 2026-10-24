#!/usr/bin/env node
/**
 * Bug Intel Learner — aggregeert patronen uit jobs + labels.
 * Schrijft naar bug-intel-patterns.json (gelezen door runner als context).
 *
 * Gebruik: node scripts/bug-intel-learner.mjs
 * PM2 cron: wekelijks maandag 09:00 UTC (id 139)
 * Of direct na het labelen van findings: node scripts/bug-intel-learner.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = join(HERE, '..')

const LEARNING_FILE = join(BASE, 'data/bug-intel-learning.jsonl')
const LABELS_FILE   = join(BASE, 'data/bug-intel-labels.jsonl')
// Quarantaine (24 okt 2026): de learner schrijft ALLEEN een kandidaat. Live gaat het pas na `diff` en `promoveer`
// met scripts/bug-intel-patterns-beheer.mjs, zodat de prompt-hints van de scan nooit stilletjes veranderen.
const PATTERNS_FILE = join(BASE, 'data/bug-intel-patterns.candidate.json')
const MIN_JOBS      = 3  // analyse al na 3 jobs

function readJsonl(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

// Alleen jobs met een ECHTE betaling tellen mee (24 okt 2026). Testjobs en de uurlijkse controles op dezelfde repo
// vertekenden de hints (gemiddelden per job, categorie-frequenties). Zet BUG_INTEL_INCLUDE_TESTJOBS=1 om ze toch mee te tellen.
const QUEUE_FILE = join(BASE, 'data/bug-intel-queue.jsonl')
const echteJobs = new Set()
for (const r of readJsonl(QUEUE_FILE)) if (/^0x[0-9a-fA-F]{64}$/.test(String(r.txHash ?? ''))) echteJobs.add(r.jobId)
const alleJobs = readJsonl(LEARNING_FILE)
const jobs = process.env.BUG_INTEL_INCLUDE_TESTJOBS === '1' ? alleJobs : alleJobs.filter(j => echteJobs.has(j.jobId))
console.log(`[learner] ${alleJobs.length} jobs in het logboek, ${jobs.length} met een echte betaling`)
const labels = readJsonl(LABELS_FILE)

if (jobs.length < MIN_JOBS && !labels.length) {
  console.log(`[learner] ${jobs.length}/${MIN_JOBS} jobs, 0 labels — te weinig data`)
  process.exit(0)
}

console.log(`[learner] ${jobs.length} jobs | ${labels.length} labels`)

// ── Aggregatie job-statistieken ────────────────────────────────────────────
const catCount = {}, catConf = {}, sevCount = {}
let totalFindings = 0

for (const job of jobs) {
  for (const f of (job.findings ?? [])) {
    totalFindings++
    const cat = f.category ?? 'UNKNOWN'
    catCount[cat] = (catCount[cat] ?? 0) + 1
    if (!catConf[cat]) catConf[cat] = []
    catConf[cat].push(f.confidence ?? 0.5)
    const sev = f.severity ?? 'Unknown'
    sevCount[sev] = (sevCount[sev] ?? 0) + 1
  }
}

const catStats = Object.entries(catCount).map(([cat, n]) => ({
  category: cat,
  count:    n,
  rate:     (n / jobs.length).toFixed(2),
  avgConf:  catConf[cat]
    ? (catConf[cat].reduce((a, b) => a + b, 0) / catConf[cat].length).toFixed(2)
    : '0'
})).sort((a, b) => b.count - a.count)

const avgFindings    = jobs.length ? (totalFindings / jobs.length).toFixed(1) : '0'
const avgDurationMin = jobs.length
  ? (jobs.reduce((s, j) => s + (j.durationMs ?? 0), 0) / jobs.length / 60000).toFixed(1)
  : '0'
const highCritRate   = jobs.length
  ? (jobs.reduce((s, j) => s + (j.highCritical ?? 0), 0) / jobs.length).toFixed(1)
  : '0'

// ── Gecalibreerde precisie per patroon (uit labels) ───────────────────────
const patternPrec = {}  // { pattern: { valid, fp } }

for (const lbl of labels) {
  const p = lbl.pattern ?? 'onbekend'
  if (!patternPrec[p]) patternPrec[p] = { valid: 0, fp: 0 }
  if (lbl.label === 'valid')          patternPrec[p].valid++
  if (lbl.label === 'false-positive') patternPrec[p].fp++
}

// Laad 3ilm base rates voor vergelijking
const ilmPath = join(BASE, 'knowledge/3ilm/sherlock/_index.json')
const ilm     = existsSync(ilmPath)
  ? (JSON.parse(readFileSync(ilmPath, 'utf8')).pattern_library ?? {})
  : {}

const calibrated = Object.entries(patternPrec).map(([pattern, s]) => {
  const total    = s.valid + s.fp
  const myPrec   = Math.round(s.valid / total * 100)
  const basePrec = ilm[pattern]
    ? Math.round(parseFloat(ilm[pattern].acceptance_rate) * 100)
    : null
  return { pattern, valid: s.valid, fp: s.fp, total, myPrec, basePrec }
}).sort((a, b) => b.myPrec - a.myPrec)

// ── Prompt-hints ───────────────────────────────────────────────────────────
const hints = []

// Uit labels: patronen die jij bewezen hebt te vinden
const highPrecision = calibrated.filter(c => c.myPrec >= 50 && c.total >= 2)
const lowPrecision  = calibrated.filter(c => c.myPrec <  35 && c.total >= 2)

if (highPrecision.length) {
  hints.push(
    `YOUR HIGH-PRECISION PATTERNS (calibrated from ${labels.length} labeled findings): ` +
    highPrecision.map(c => `${c.pattern} ${c.myPrec}% (${c.valid}v/${c.fp}fp)`).join(', ')
  )
}
if (lowPrecision.length) {
  hints.push(
    `AVOID THESE (low precision in your audits): ` +
    lowPrecision.map(c => `${c.pattern} ${c.myPrec}% (${c.valid}v/${c.fp}fp)`).join(', ')
  )
}

// Uit job-statistieken
const topCats = catStats.filter(c => parseFloat(c.avgConf) >= 0.5).slice(0, 3).map(c => c.category)
if (topCats.length) hints.push(`Highest confidence categories in past jobs: ${topCats.join(', ')}`)
if (parseFloat(highCritRate) > 1)
  hints.push(`Average ${highCritRate} High/Critical per job — deep analysis pays off`)
if (parseFloat(avgFindings) < 2 && jobs.length >= MIN_JOBS)
  hints.push('Low finding rate — broaden to edge cases and access control checks')

// ── Schrijf patterns.json ──────────────────────────────────────────────────
const patterns = {
  generatedAt:       new Date().toISOString(),
  jobsAnalyzed:      jobs.length,
  labelsUsed:        labels.length,
  totalFindings,
  avgFindingsPerJob: parseFloat(avgFindings),
  avgDurationMin:    parseFloat(avgDurationMin),
  avgHighCritPerJob: parseFloat(highCritRate),
  categoryStats:     catStats,
  severityDist:      sevCount,
  topCategories:     topCats,
  calibratedPatterns: calibrated,
  promptHints:       hints,
}

writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2))

console.log(`[learner] Opgeslagen: ${PATTERNS_FILE}`)
console.log(`[learner] ${jobs.length} jobs | ${labels.length} labels | ${hints.length} hints`)
for (const h of hints) console.log(`  - ${h}`)

if (calibrated.length) {
  console.log('\n[learner] Gecalibreerde precisie:')
  for (const c of calibrated) {
    const base = c.basePrec ? ` (3ilm base: ${c.basePrec}%)` : ''
    const trend = c.basePrec
      ? (c.myPrec > c.basePrec ? ' ↑' : c.myPrec < c.basePrec ? ' ↓' : ' =')
      : ''
    console.log(`  ${c.pattern.padEnd(22)} ${c.myPrec}%${trend}${base} — ${c.valid}v/${c.fp}fp`)
  }
}
