#!/usr/bin/env node
/**
 * Bouwt het register voor de meting van versie 3: per Sherlock-wedstrijd de UNIEKE geldige High- en Medium-bevindingen
 * uit het eindrapport (README van de judging-repo), met het aantal vinders per bevinding (moeilijkheidsmaat), plus of de
 * bronrepo bestaat en hoeveel eigen Solidity erin zit volgens dezelfde regels als de scan (bug-intel-scope).
 *
 *   node registry-bouwen.mjs <uitmap>            schrijft contests.json
 *
 * De verdeling over ontwikkelset en verzegelde set gebeurt in verdeel.mjs, met een publiek zaad (hash van een Base-blok).
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { precheckRepo } from './bug-intel-precheck.mjs'

const uit = process.argv[2] ?? '.'
mkdirSync(uit, { recursive: true })
const index = JSON.parse(readFileSync(process.argv[3], 'utf8')) // lijst met wedstrijdnamen (zonder -judging)

/** Eindrapport -> unieke bevindingen. Een kop is "# Issue H-3: titel", daarna "Source: ..." en "## Found by" met namen. */
export function parseRapport(md) {
  const delen = md.split(/^# Issue ([HM])-(\d+): (.*)$/m)
  const uit = []
  for (let i = 1; i + 3 <= delen.length; i += 4) {
    const [sev, nr, titel, tekst] = [delen[i], delen[i + 1], delen[i + 2], delen[i + 3]]
    const bron = tekst.match(/Source:\s*(\S+)/)?.[1] ?? ''
    const vinders = (tekst.match(/## Found by\s*\n([\s\S]*?)\n\s*\n###?\s/)?.[1] ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const na = tekst.split(/## Found by[\s\S]*?\n\s*\n/)[1] ?? tekst
    const bestanden = [...new Set([...na.matchAll(/blob\/[^/\s]+\/([^\s#)]+\.sol)/g)].map(m => m[1]))].slice(0, 8)
    uit.push({ id: `${sev}-${nr}`, severity: sev === 'H' ? 'High' : 'Medium', title: titel.trim(), source: bron, finders: vinders.length, files: bestanden, excerpt: na.replace(/\s+/g, ' ').trim().slice(0, 1400) })
  }
  return uit
}

const lijst = []
for (const contest of index) {
  const judging = `sherlock-audit/${contest}-judging`
  let md = ''
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${judging}/main/README.md`, { signal: AbortSignal.timeout(60000) })
    if (!r.ok) { console.log(`${contest}: geen eindrapport (${r.status})`); continue }
    md = await r.text()
  } catch (e) { console.log(`${contest}: fout ${e.message}`); continue }
  const issues = parseRapport(md)
  const bron = `sherlock-audit/${contest}`
  const heeft = spawnSync('git', ['ls-remote', '--exit-code', `https://github.com/${bron}`, 'HEAD'], { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 30000 }).status === 0
  let pre = null
  if (heeft) pre = await precheckRepo(bron)
  const rij = {
    contest, judgingRepo: judging, sourceRepo: bron, sourceBestaat: heeft,
    inScopeFiles: pre?.inScopeFiles ?? 0, inScopeKb: pre?.inScopeKb ?? 0, precheck: pre ? (pre.ok === true ? 'ok' : pre.reason ?? 'onbekend') : 'geen-bronrepo',
    high: issues.filter(i => i.severity === 'High').length, medium: issues.filter(i => i.severity === 'Medium').length, issues,
  }
  lijst.push(rij)
  console.log(`${contest.padEnd(44)} H${rij.high} M${rij.medium} | bron ${heeft ? 'ja' : 'nee'} | in scope ${rij.inScopeFiles} bestanden ${rij.inScopeKb} KB | ${rij.precheck}`)
}
writeFileSync(join(uit, 'contests.json'), JSON.stringify({ gemaakt: new Date().toISOString(), contests: lijst }, null, 1))
console.log('geschreven:', lijst.length, 'wedstrijden')
