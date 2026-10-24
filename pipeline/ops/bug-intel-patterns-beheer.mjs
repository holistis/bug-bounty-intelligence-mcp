#!/usr/bin/env node
/**
 * Beheer van de prompt-hints van de scan (data/bug-intel-patterns.json) met geschiedenis en quarantaine.
 *
 *   node scripts/bug-intel-patterns-beheer.mjs lijst        toon de bewaarde versies
 *   node scripts/bug-intel-patterns-beheer.mjs snapshot     bewaar de live versie (met tijd en hash)
 *   node scripts/bug-intel-patterns-beheer.mjs diff         wat verschilt de kandidaat van de live versie
 *   node scripts/bug-intel-patterns-beheer.mjs promoveer    eerst de bewijspoort (bug-intel-benchmark.mjs), dan bewaar live en zet de kandidaat live (--forceer slaat de poort over, met logregel)
 *   node scripts/bug-intel-patterns-beheer.mjs terug        zet de laatste bewaarde versie weer live
 *
 * De learner schrijft alleen nog naar bug-intel-patterns.candidate.json. Niets gaat live zonder dat iemand
 * eerst `diff` heeft gezien en `promoveer` heeft gedraaid. Elke promotie en elke terugzet staat in versions/LOG.jsonl.
 * Alleen tekstbestanden met prompt-hints, geen uitvoerbare inhoud.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = process.env.BUG_INTEL_DATA_DIR ?? join(HERE, '..', 'data')
const LIVE = join(DATA, 'bug-intel-patterns.json')
const KANDIDAAT = join(DATA, 'bug-intel-patterns.candidate.json')
const VERSIES = join(DATA, 'versions')
const LOG = join(VERSIES, 'LOG.jsonl')

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const lees = (p) => JSON.parse(readFileSync(p, 'utf8'))
const log = (rij) => { mkdirSync(VERSIES, { recursive: true }); appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...rij }) + '\n') }

function snapshot(reden) {
  if (!existsSync(LIVE)) throw new Error('geen live bestand om te bewaren')
  mkdirSync(VERSIES, { recursive: true })
  const h = sha(LIVE)
  const naam = `patterns-${new Date().toISOString().replace(/[:.]/g, '-')}-${h.slice(0, 8)}.json`
  const bestaand = readdirSync(VERSIES).filter(f => f.endsWith(`-${h.slice(0, 8)}.json`))
  if (bestaand.length) { console.log(`al bewaard als ${bestaand[bestaand.length - 1]}`); return bestaand[bestaand.length - 1] }
  copyFileSync(LIVE, join(VERSIES, naam))
  log({ actie: 'snapshot', reden, bestand: naam, sha256: h })
  console.log(`bewaard: ${naam}`)
  return naam
}

function hints(p) { const j = lees(p); return { hints: j.promptHints ?? [], gen: j.generatedAt, jobs: j.jobsAnalyzed, labels: j.labelsUsed } }

const cmd = process.argv[2]
if (cmd === 'lijst') {
  if (!existsSync(VERSIES)) { console.log('nog geen bewaarde versies'); process.exit(0) }
  for (const f of readdirSync(VERSIES).filter(f => f.endsWith('.json')).sort()) console.log(f)
  if (existsSync(LIVE)) console.log(`live nu: sha256 ${sha(LIVE).slice(0, 16)}`)
} else if (cmd === 'snapshot') {
  snapshot('handmatig')
} else if (cmd === 'diff') {
  if (!existsSync(KANDIDAAT)) { console.log('geen kandidaat aanwezig'); process.exit(0) }
  const l = hints(LIVE), k = hints(KANDIDAAT)
  console.log(`LIVE      gegenereerd ${l.gen} | ${l.jobs} jobs | ${l.labels} labels | ${l.hints.length} hints`)
  console.log(`KANDIDAAT gegenereerd ${k.gen} | ${k.jobs} jobs | ${k.labels} labels | ${k.hints.length} hints`)
  const weg = l.hints.filter(h => !k.hints.includes(h)), erbij = k.hints.filter(h => !l.hints.includes(h))
  console.log(`\nVERWIJDERD (${weg.length}):`); weg.forEach(h => console.log('  - ' + h))
  console.log(`\nTOEGEVOEGD (${erbij.length}):`); erbij.forEach(h => console.log('  + ' + h))
  if (weg.some(h => /^AVOID/.test(h))) console.log('\nLET OP: een AVOID-hint verdwijnt. Dat is een mogelijke regressie.')
} else if (cmd === 'promoveer') {
  if (!existsSync(KANDIDAAT)) { console.error('geen kandidaat aanwezig'); process.exit(1) }
  lees(KANDIDAAT) // moet geldige JSON zijn
  // Poort 3: eerst de bewijspoort. Alleen met --forceer (en een regel in het logboek) gaat het er toch langs.
  const poort = spawnSync(process.execPath, [join(HERE, 'bug-intel-benchmark.mjs')], { env: { ...process.env, BUG_INTEL_DATA_DIR: DATA }, encoding: 'utf8' })
  process.stdout.write(poort.stdout ?? '')
  if (poort.status !== 0) {
    if (!process.argv.includes('--forceer')) { console.error('\nGeweigerd: de kandidaat haalt de bewijspoort niet. Gebruik --forceer alleen met een goede reden.'); process.exit(1) }
    log({ actie: 'forceer', reden: 'bewijspoort rood, bewust overschreven' })
  }
  const bewaard = snapshot('voor promotie')
  copyFileSync(KANDIDAAT, LIVE)
  log({ actie: 'promoveer', van: 'candidate', sha256: sha(LIVE), vorige: bewaard })
  console.log('kandidaat staat nu live, vorige versie bewaard als ' + bewaard)
} else if (cmd === 'terug') {
  const lijst = existsSync(VERSIES) ? readdirSync(VERSIES).filter(f => f.endsWith('.json')).sort() : []
  const huidig = existsSync(LIVE) ? sha(LIVE).slice(0, 8) : ''
  const vorige = [...lijst].reverse().find(f => !f.endsWith(`-${huidig}.json`))
  if (!vorige) { console.error('geen eerdere versie om naar terug te gaan'); process.exit(1) }
  const bewaard = snapshot('voor terugzetten')
  copyFileSync(join(VERSIES, vorige), LIVE)
  log({ actie: 'terug', naar: vorige, sha256: sha(LIVE), vorige: bewaard })
  console.log('teruggezet naar ' + vorige)
} else {
  console.log('gebruik: lijst | snapshot | diff | promoveer | terug')
  process.exit(2)
}
