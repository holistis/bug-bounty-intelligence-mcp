#!/usr/bin/env node
/**
 * Kiest de beoordelaars voor een volgende run op basis van metingen, niet van gevoel.
 *
 * De scorekaart (bench/scorekaart.jsonl) krijgt een regel per beoordelaar bij elke kalibratie (kalibreer.mjs). Hier telt de NIEUWSTE regel per model.
 * Rangorde: eerst het minste aantal fouten (gemiste treffers, verkeerd gekoppeld, onzin-treffers en weggegooide antwoorden bij elkaar), dan de laagste kosten.
 * Er worden er twee gekozen, uit verschillende modelfamilies (het deel van het model-id voor de schuine streep): een strenge treffer vraagt twee onafhankelijke lezers.
 *
 * Dit kiest NIETS zelf: de beoordelaars van een vooraf geregistreerde run staan vast in judge.mjs (OORDEELDERS). Dit levert het advies voor de VOLGENDE registratie,
 * met de cijfers erbij, zodat de keuze nagelopen kan worden.
 *
 *   node bench/kies-rechters.mjs [scorekaart.jsonl]
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const familie = (model) => String(model ?? '').split('/')[0].toLowerCase()

/** Het aantal fouten van een regel op de scorekaart. Ontbrekende velden tellen als 0, een regel zonder metingen (n = 0) telt niet mee. */
export function fouten(r) {
  const p = r.positief ?? {}, n = r.negatief ?? {}
  return Number(p.mis ?? 0) + Number(p.fout ?? 0) + Number(n.onzin ?? 0) + Number(r.ongeldig ?? 0)
}

/** Nieuwste regel per model, op datum (bij gelijke datum de laatste in het bestand). */
export function nieuwstePerModel(regels) {
  const kaart = new Map()
  for (const r of regels) {
    if (!r || !r.model || !((r.positief?.n ?? 0) + (r.negatief?.n ?? 0) > 0)) continue
    const eerder = kaart.get(r.model)
    if (!eerder || String(r.datum) >= String(eerder.datum)) kaart.set(r.model, r)
  }
  return [...kaart.values()]
}

/** Kiest `aantal` beoordelaars uit verschillende families: eerst het minste aantal fouten, dan de laagste kosten. Geeft ook de reden terug. */
export function kiesRechters(regels, { aantal = 2 } = {}) {
  const lijst = nieuwstePerModel(regels).sort((a, b) => fouten(a) - fouten(b) || Number(a.kosten ?? 0) - Number(b.kosten ?? 0))
  const gekozen = [], families = new Set()
  for (const r of lijst) {
    if (families.has(familie(r.model))) continue
    families.add(familie(r.model)); gekozen.push(r)
    if (gekozen.length === aantal) break
  }
  return {
    gekozen: gekozen.map((r) => ({ model: r.model, naam: r.naam, fouten: fouten(r), kosten: Number(r.kosten ?? 0), datum: r.datum })),
    genoeg: gekozen.length === aantal,
    uitleg: gekozen.length === aantal
      ? 'Gekozen op de nieuwste scorekaart: het minste aantal fouten, dan de laagste kosten, uit verschillende modelfamilies.'
      : 'Te weinig gemeten modellen uit verschillende families om ' + aantal + ' beoordelaars te kiezen: meet eerst meer kandidaten (kalibreer.mjs met bench/kandidaten.json).',
  }
}

/**
 * Kiest EEN extra rechter voor de rol van scheidsrechter bij onenigheid (bench/judge.mjs, beslisVoor): het minste aantal
 * fouten, dan de laagste kosten, uit een modelfamilie die nog niet in `gebruikteModellen` voorkomt (de twee vaste
 * rechters). Geeft undefined als er geen kandidaat uit een nieuwe familie gemeten is.
 */
export function kiesDerde(regels, gebruikteModellen = []) {
  const gebruikteFamilies = new Set(gebruikteModellen.map(familie))
  const lijst = nieuwstePerModel(regels)
    .filter((r) => !gebruikteFamilies.has(familie(r.model)))
    .sort((a, b) => fouten(a) - fouten(b) || Number(a.kosten ?? 0) - Number(b.kosten ?? 0))
  return lijst[0] ? { model: lijst[0].model, naam: lijst[0].naam, fouten: fouten(lijst[0]), kosten: Number(lijst[0].kosten ?? 0) } : undefined
}

export function leesScorekaart(pad) {
  if (!existsSync(pad)) return []
  return readFileSync(pad, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pad = process.argv[2] ?? fileURLToPath(new URL('./scorekaart.jsonl', import.meta.url))
  const r = kiesRechters(leesScorekaart(pad))
  console.log(r.uitleg)
  for (const g of r.gekozen) console.log(`${g.model.padEnd(36)} fouten ${g.fouten} | kosten ${g.kosten.toFixed(4)} dollar | gemeten ${g.datum}`)
  process.exit(r.genoeg ? 0 : 1)
}
