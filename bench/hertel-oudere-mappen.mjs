#!/usr/bin/env node
/**
 * Rekent de vijf oudere mappen met weggegooide antwoorden opnieuw door, met de data die er al ligt (res-*.json): geen
 * nieuwe rechter-aanroepen, geen OpenRouter-kosten. Dit is ONS EIGEN mechanische bereik, geen reconstructie van Tom
 * Smart zijn methode (open check 1 in results/README.md blijft open tot een van onze commando's zijn getallen haalt):
 *
 *  - ondergrens: de gepubliceerde regel, ongewijzigd. Een weggegooid antwoord telt als "geen treffer".
 *  - bovengrens: is van de twee rechters een weggegooid en vond de ander een echt bekend nummer, dan telt dat als een
 *    treffer (het voordeel van de twijfel: misschien was de weggegooide rechter het er wel mee eens). Zijn BEIDE
 *    weggegooid, dan redt dat voordeel niets (4 nov 2026, dezelfde reden als bij de layeredge-100-procent).
 *
 *   node bench/hertel-oudere-mappen.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const MAPPEN = ['2026-10-24-dev-set', '2026-10-24-dev-set-2', '2026-10-25-v31', '2026-10-26-evmbench', '2026-10-31-lab-sealed']

/** Telt de streng-gevonden hypotheses in een hypothesesLijst (uit res-*.json), met of zonder het voordeel van de twijfel. */
export function telStreng(hypothesesLijst, { bovengrens = false } = {}) {
  let streng = 0, weggegooid = 0
  for (const h of hypothesesLijst) {
    let { a, b } = h
    if (a.ongeldig) weggegooid++
    if (b.ongeldig) weggegooid++
    if (bovengrens) {
      if (a.ongeldig && !b.ongeldig && b.match) a = { match: b.match }
      else if (b.ongeldig && !a.ongeldig && a.match) b = { match: a.match }
    }
    if (a.match && a.match === b.match && !a.ongeldig && !b.ongeldig) streng++
  }
  return { streng, weggegooid, hypotheses: hypothesesLijst.length }
}

/** Alle res-*.json van een map bij elkaar opgeteld, per lezing. Andere mappen bewaren geen a/b per hypothese (ouder formaat: alleen totalen) en kunnen hier niet mee herteld worden. */
export function telMap(wortel, map) {
  const dir = `${wortel}/results/${map}`
  if (!existsSync(dir)) return undefined
  const bestanden = readdirSync(dir).filter((f) => /^res-.*\.json$/.test(f))
  if (bestanden.length === 0) return { map, bestanden: [], nietGeschikt: 'geen res-*.json: dit is een ouder formaat met alleen totalen per audit, geen a/b per hypothese' }
  let onder = 0, boven = 0, hyps = 0, weggegooid = 0
  for (const f of bestanden) {
    const j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
    for (const w of Object.values(j.wedstrijden)) {
      const u = telStreng(w.hypothesesLijst, { bovengrens: false })
      const o = telStreng(w.hypothesesLijst, { bovengrens: true })
      onder += u.streng; boven += o.streng; hyps += u.hypotheses; weggegooid += u.weggegooid
    }
  }
  return { map, bestanden, hypotheses: hyps, weggegooid, strengOndergrens: onder, strengBovengrens: boven }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const wortel = process.cwd()
  for (const map of MAPPEN) {
    const r = telMap(wortel, map)
    if (!r) { console.log(`${map}: map niet gevonden`); continue }
    if (r.nietGeschikt) { console.log(`${map.padEnd(22)} niet hertelbaar met dit commando: ${r.nietGeschikt}`); continue }
    console.log(`${map.padEnd(22)} hypotheses ${String(r.hypotheses).padStart(3)} | weggegooid ${String(r.weggegooid).padStart(3)} | streng ondergrens ${r.strengOndergrens} | streng bovengrens ${r.strengBovengrens} (${r.bestanden.join(', ')})`)
  }
}
