#!/usr/bin/env node
/**
 * Test het meetinstrument zelf, voor het iets meet. Twee proeven per beoordelaar:
 *  1. POSITIEF: een bekende bevinding, in andere woorden als hypothese aangeboden (titel + begin van de uitleg als beschrijving),
 *     moet aan zichzelf worden gekoppeld.
 *  2. NEGATIEF: een bekende bevinding van een ANDERE wedstrijd moet aan geen enkele bevinding van deze wedstrijd worden gekoppeld.
 * Zo weten we hoe vaak de beoordelaars een echte treffer missen en hoe vaak ze een onzin-treffer toekennen.
 *
 *   OPENROUTER_API_KEY=... node kalibreer.mjs ontwikkelset.json uit.json [aantal per wedstrijd]
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { OORDEELDERS, bouwPrompt, vraagEnLees } from './judge.mjs'
import { haalSleutel } from './sleutel.mjs'

const [, , setBestand, uitBestand, nStr] = process.argv
const n = Number(nStr ?? 4)
const sleutel = haalSleutel('OPENROUTER_API_KEY')
if (!sleutel) { console.error('geen sleutel beschikbaar'); process.exit(2) }
const set = JSON.parse(readFileSync(setBestand, 'utf8')).contests

// deterministische keuze: de eerste n bevindingen met een uitleg van minstens 300 tekens
const kies = (c, k) => c.issues.filter(i => (i.excerpt ?? '').length >= 300).slice(0, k)
const alsHypothese = (i) => ({ title: i.title, file: (i.files ?? [])[0] ?? '', function: '', description: i.excerpt })

// Standaard worden de twee vastgelegde beoordelaars gemeten. Met een lijst kandidaten (bench/kandidaten.json, of het pad als vijfde argument) worden
// ook andere modellen gemeten en op de scorekaart gezet, zodat de keuze van beoordelaars voor een volgende run op metingen berust (zie kies-rechters.mjs).
const kandidatenBestand = process.argv[5]
const RECHTERS = kandidatenBestand ? JSON.parse(readFileSync(kandidatenBestand, 'utf8')).kandidaten : OORDEELDERS
const rij = {}
for (const o of RECHTERS) rij[o.naam] = { positief: { n: 0, raak: 0, mis: 0, fout: 0 }, negatief: { n: 0, onzin: 0 }, ongeldig: 0, kosten: 0 }

for (let ci = 0; ci < set.length; ci++) {
  const c = set[ci], ander = set[(ci + 1) % set.length]
  const pos = kies(c, n), neg = kies(ander, n)
  for (const o of RECHTERS) {
    for (const i of pos) {
      const l = await vraagEnLees({ model: o.model, sleutel, prompt: bouwPrompt(alsHypothese(i), c.issues), bekende: c.issues })
      rij[o.naam].kosten += l.kosten; rij[o.naam].positief.n++
      if (l.ongeldig) rij[o.naam].ongeldig++
      if (l.match === i.id) rij[o.naam].positief.raak++
      else if (l.match) rij[o.naam].positief.fout++
      else rij[o.naam].positief.mis++
    }
    for (const i of neg) {
      const l = await vraagEnLees({ model: o.model, sleutel, prompt: bouwPrompt(alsHypothese(i), c.issues), bekende: c.issues })
      rij[o.naam].kosten += l.kosten; rij[o.naam].negatief.n++
      if (l.ongeldig) rij[o.naam].ongeldig++
      if (l.match) rij[o.naam].negatief.onzin++
    }
  }
  console.log(`${c.contest}: klaar`)
}
for (const [naam, v] of Object.entries(rij)) {
  console.log(`${naam}: positief ${v.positief.raak}/${v.positief.n} raak, ${v.positief.mis} gemist, ${v.positief.fout} verkeerd gekoppeld | negatief ${v.negatief.onzin}/${v.negatief.n} onzin-treffers | weggegooid ${v.ongeldig} | kosten ${v.kosten.toFixed(4)} dollar`)
}
writeFileSync(uitBestand, JSON.stringify(rij, null, 1))
// De scorekaart groeit met elke meting: een regel per beoordelaar, met de datum. kies-rechters.mjs leest de nieuwste regel per model.
const datum = new Date().toISOString().slice(0, 10)
const scorekaart = new URL('./scorekaart.jsonl', import.meta.url)
for (const o of RECHTERS) appendFileSync(scorekaart, JSON.stringify({ datum, naam: o.naam, model: o.model, n_per_wedstrijd: n, ...rij[o.naam] }) + '\n')
