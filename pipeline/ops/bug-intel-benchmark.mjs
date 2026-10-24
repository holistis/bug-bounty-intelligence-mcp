#!/usr/bin/env node
/**
 * Poort 3 van de leerlus: mag de kandidaat-hints live? (data/bug-intel-patterns.candidate.json tegen de live versie)
 *
 * WAT DIT WEL EN NIET MEET. Dit is een poort op BEWIJS: is elke bewering in de nieuwe hints onderbouwd door voldoende
 * gelabelde bevindingen, en verdwijnt er geen waarschuwing zonder nieuw bewijs. Het meet NIET of de scan er beter van
 * wordt. Dat meet de wedstrijd-benchmark (vooraf geregistreerd, op wedstrijden die niet in de bronnen zitten).
 *
 *   node scripts/bug-intel-benchmark.mjs        exit 0 = mag live, exit 1 = blijft in quarantaine
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MIN_NIEUWE_JOBS = 3
export const MIN_NIEUWE_LABELS = 2
export const MIN_LABELS_PER_CLAIM = 2
export const HOOG = 50
export const LAAG = 35

const cal = (j) => Array.isArray(j?.calibratedPatterns) ? j.calibratedPatterns : []

/** Zuivere beoordeling, apart zodat ze te testen is. Geeft { pass, checks: [{naam, ok, reden}] }. */
export function beoordeel(live, kandidaat) {
  const checks = []
  const zet = (naam, ok, reden) => checks.push({ naam, ok, reden })

  const geldig = (j) => j && typeof j === 'object' && Array.isArray(j.promptHints)
  if (!geldig(kandidaat)) { zet('structuur', false, 'de kandidaat heeft geen promptHints-lijst'); return { pass: false, checks } }
  zet('structuur', true, `${kandidaat.promptHints.length} hints`)
  const l = geldig(live) ? live : { promptHints: [], jobsAnalyzed: 0, labelsUsed: 0, calibratedPatterns: [] }

  const nieuweJobs = (kandidaat.jobsAnalyzed ?? 0) - (l.jobsAnalyzed ?? 0)
  const nieuweLabels = (kandidaat.labelsUsed ?? 0) - (l.labelsUsed ?? 0)
  zet('nieuw bewijs', nieuweJobs >= MIN_NIEUWE_JOBS || nieuweLabels >= MIN_NIEUWE_LABELS,
    `${nieuweJobs} nieuwe jobs (nodig ${MIN_NIEUWE_JOBS}) of ${nieuweLabels} nieuwe labels (nodig ${MIN_NIEUWE_LABELS})`)

  // elke HOGE claim moet onderbouwd zijn en beter dan de basisratio van de bron
  const kal = cal(kandidaat)
  const hoge = kal.filter(c => c.myPrec >= HOOG && c.total >= MIN_LABELS_PER_CLAIM)
  const slechteHoge = hoge.filter(c => c.basePrec != null && c.myPrec < c.basePrec)
  zet('hoge claims onderbouwd', slechteHoge.length === 0,
    slechteHoge.length ? `onder de basisratio: ${slechteHoge.map(c => `${c.pattern} ${c.myPrec}% tegen ${c.basePrec}%`).join(', ')}` : `${hoge.length} hoge claim(s), geen onder de basisratio`)

  // geen claim op te weinig labels
  const tekst = kandidaat.promptHints.join(' \n ')
  const dun = kal.filter(c => c.total < MIN_LABELS_PER_CLAIM && tekst.includes(c.pattern))
  zet('geen claims op te weinig labels', dun.length === 0,
    dun.length ? `genoemd met minder dan ${MIN_LABELS_PER_CLAIM} labels: ${dun.map(c => c.pattern).join(', ')}` : 'alle genoemde patronen hebben genoeg labels')

  // een waarschuwing (AVOID) verdwijnt alleen met nieuw, goed bewijs
  const liveAvoid = cal(l).filter(c => c.myPrec < LAAG && c.total >= MIN_LABELS_PER_CLAIM)
  const verdwenen = []
  for (const a of liveAvoid) {
    const nu = kal.find(c => c.pattern === a.pattern)
    const nogLaag = nu && nu.myPrec < LAAG && nu.total >= MIN_LABELS_PER_CLAIM
    const bewezenBeter = nu && nu.total > a.total && nu.myPrec >= HOOG
    if (!nogLaag && !bewezenBeter) verdwenen.push(a.pattern)
  }
  zet('waarschuwingen blijven', verdwenen.length === 0,
    verdwenen.length ? `verdwenen zonder nieuw bewijs: ${verdwenen.join(', ')}` : `${liveAvoid.length} waarschuwing(en) intact of met bewijs vervangen`)

  return { pass: checks.every(c => c.ok), checks }
}

// ---- opdrachtregel ----
if (process.argv[1] && process.argv[1].endsWith('bug-intel-benchmark.mjs')) {
  const HERE = dirname(fileURLToPath(import.meta.url))
  const DATA = process.env.BUG_INTEL_DATA_DIR ?? join(HERE, '..', 'data')
  const LIVE = join(DATA, 'bug-intel-patterns.json'), KAND = join(DATA, 'bug-intel-patterns.candidate.json')
  if (!existsSync(KAND)) { console.log('geen kandidaat aanwezig, niets te beoordelen'); process.exit(1) }
  let kandidaat, live = null
  try { kandidaat = JSON.parse(readFileSync(KAND, 'utf8')) } catch { kandidaat = null }
  try { live = existsSync(LIVE) ? JSON.parse(readFileSync(LIVE, 'utf8')) : null } catch { live = null }
  const r = beoordeel(live, kandidaat)
  for (const c of r.checks) console.log(`${c.ok ? 'GROEN' : 'ROOD '}  ${c.naam}: ${c.reden}`)
  console.log(r.pass ? '\nUITSLAG: de kandidaat mag live (alleen een bewijspoort, geen meting van de scan zelf).' : '\nUITSLAG: de kandidaat blijft in quarantaine.')
  mkdirSync(join(DATA, 'versions'), { recursive: true })
  appendFileSync(join(DATA, 'versions', 'BENCHMARK-LOG.jsonl'), JSON.stringify({ ts: new Date().toISOString(), pass: r.pass, checks: r.checks }) + '\n')
  process.exit(r.pass ? 0 : 1)
}
