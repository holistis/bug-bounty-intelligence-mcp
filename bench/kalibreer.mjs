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
import { readFileSync, writeFileSync } from 'node:fs'
import { OORDEELDERS, bouwPrompt, leesOordeel, vraagBeoordelaar } from './judge.mjs'
import { haalSleutel } from './sleutel.mjs'

const [, , setBestand, uitBestand, nStr] = process.argv
const n = Number(nStr ?? 4)
const sleutel = haalSleutel('OPENROUTER_API_KEY')
if (!sleutel) { console.error('geen sleutel beschikbaar'); process.exit(2) }
const set = JSON.parse(readFileSync(setBestand, 'utf8')).contests

// deterministische keuze: de eerste n bevindingen met een uitleg van minstens 300 tekens
const kies = (c, k) => c.issues.filter(i => (i.excerpt ?? '').length >= 300).slice(0, k)
const alsHypothese = (i) => ({ title: i.title, file: (i.files ?? [])[0] ?? '', function: '', description: i.excerpt })

const rij = {}
for (const o of OORDEELDERS) rij[o.naam] = { positief: { n: 0, raak: 0, mis: 0, fout: 0 }, negatief: { n: 0, onzin: 0 }, kosten: 0 }

for (let ci = 0; ci < set.length; ci++) {
  const c = set[ci], ander = set[(ci + 1) % set.length]
  const pos = kies(c, n), neg = kies(ander, n)
  for (const o of OORDEELDERS) {
    for (const i of pos) {
      const r = await vraagBeoordelaar({ model: o.model, sleutel, prompt: bouwPrompt(alsHypothese(i), c.issues) })
      const l = leesOordeel(r.tekst, c.issues)
      rij[o.naam].kosten += r.kosten; rij[o.naam].positief.n++
      if (l.match === i.id) rij[o.naam].positief.raak++
      else if (l.match) rij[o.naam].positief.fout++
      else rij[o.naam].positief.mis++
    }
    for (const i of neg) {
      const r = await vraagBeoordelaar({ model: o.model, sleutel, prompt: bouwPrompt(alsHypothese(i), c.issues) })
      const l = leesOordeel(r.tekst, c.issues)
      rij[o.naam].kosten += r.kosten; rij[o.naam].negatief.n++
      if (l.match) rij[o.naam].negatief.onzin++
    }
  }
  console.log(`${c.contest}: klaar`)
}
for (const [naam, v] of Object.entries(rij)) {
  console.log(`${naam}: positief ${v.positief.raak}/${v.positief.n} raak, ${v.positief.mis} gemist, ${v.positief.fout} verkeerd gekoppeld | negatief ${v.negatief.onzin}/${v.negatief.n} onzin-treffers | kosten ${v.kosten.toFixed(4)} dollar`)
}
writeFileSync(uitBestand, JSON.stringify(rij, null, 1))
