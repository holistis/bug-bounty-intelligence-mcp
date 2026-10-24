#!/usr/bin/env node
/**
 * Laat de twee beoordelaars de hypotheses van een reeks uitkomsten nakijken en telt de uitslag.
 *
 *   node beoordeel.mjs <set.json> <uitmap> <voorvoegsel> <resultaat.json>
 *
 * Een uitkomstbestand heet <voorvoegsel>__<wedstrijd>.json en heeft een lijst `hypotheses`, of is het jsonbestand van de
 * testkopie van de scan (`hypotheses` met dezelfde velden). Elke uitspraak van een beoordelaar wordt bewaard, zodat iedereen kan narekenen.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { OORDEELDERS, bouwPrompt, leesOordeel, vraagBeoordelaar, scoor } from './judge.mjs'
import { haalSleutel } from './sleutel.mjs'

const [, , setPad, uitmap, voor, uitPad] = process.argv
const set = JSON.parse(readFileSync(setPad, 'utf8')).contests
const sleutel = haalSleutel('OPENROUTER_API_KEY')
if (!sleutel) { console.error('geen sleutel beschikbaar'); process.exit(2) }

const resultaat = { voorvoegsel: voor, wedstrijden: {}, totaal: null, kosten: 0 }
const som = { bekend: 0, hyps: 0, streng: 0, ruim: 0, strengHyp: 0, eens: 0, perNiveau: { makkelijk: { totaal: 0, streng: 0 }, midden: { totaal: 0, streng: 0 }, moeilijk: { totaal: 0, streng: 0 } } }
for (const c of set) {
  const pad = join(uitmap, `${voor}__${c.contest}.json`)
  if (!existsSync(pad)) { console.log(`${c.contest}: geen uitkomst`); continue }
  const hyps = JSON.parse(readFileSync(pad, 'utf8')).hypotheses ?? []
  const oordelen = []
  for (const h of hyps) {
    const prompt = bouwPrompt(h, c.issues)
    const [a, b] = await Promise.all(OORDEELDERS.map(async o => {
      const r = await vraagBeoordelaar({ model: o.model, sleutel, prompt })
      resultaat.kosten += r.kosten
      return { ...leesOordeel(r.tekst, c.issues), model: o.naam }
    }))
    oordelen.push({ a, b })
  }
  const s = scoor(hyps, c.issues, oordelen)
  resultaat.wedstrijden[c.contest] = { ...s, hypothesesLijst: hyps.map((h, i) => ({ title: h.title, file: h.file, function: String(h.function ?? '').split('\n')[0], a: oordelen[i].a, b: oordelen[i].b })) }
  som.bekend += s.bekend; som.hyps += s.hypotheses; som.streng += s.gevondenStreng.length; som.ruim += s.gevondenRuim.length
  som.strengHyp += Math.round(s.precisieStreng * s.hypotheses); som.eens += Math.round(s.overeenstemming * s.hypotheses)
  for (const n of ['makkelijk', 'midden', 'moeilijk']) { som.perNiveau[n].totaal += s.perNiveau[n].totaal; som.perNiveau[n].streng += s.perNiveau[n].streng }
  console.log(`${c.contest.padEnd(34)} bekend ${String(s.bekend).padStart(2)} | hypotheses ${String(s.hypotheses).padStart(2)} | streng ${s.gevondenStreng.length} ruim ${s.gevondenRuim.length} | overeenstemming ${(s.overeenstemming * 100).toFixed(0)}%`)
}
resultaat.totaal = { ...som, recallStreng: som.bekend ? som.streng / som.bekend : 0, recallRuim: som.bekend ? som.ruim / som.bekend : 0, precisieStreng: som.hyps ? som.strengHyp / som.hyps : 0, overeenstemming: som.hyps ? som.eens / som.hyps : 1 }
writeFileSync(uitPad, JSON.stringify(resultaat, null, 1))
console.log(`TOTAAL ${voor}: bekend ${som.bekend}, streng gevonden ${som.streng} (${(resultaat.totaal.recallStreng * 100).toFixed(1)}%), ruim ${som.ruim}, precisie streng ${(resultaat.totaal.precisieStreng * 100).toFixed(1)}%, overeenstemming ${(resultaat.totaal.overeenstemming * 100).toFixed(0)}%, makkelijk ${som.perNiveau.makkelijk.streng}/${som.perNiveau.makkelijk.totaal}, midden ${som.perNiveau.midden.streng}/${som.perNiveau.midden.totaal}, moeilijk ${som.perNiveau.moeilijk.streng}/${som.perNiveau.moeilijk.totaal}, kosten beoordelaars ${resultaat.kosten.toFixed(4)} dollar`)
