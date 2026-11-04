#!/usr/bin/env node
/**
 * Nakijken van de meting: komt een hypothese van de scan overeen met een bekende, geldige bevinding van de wedstrijd?
 * Twee beoordelaars van verschillende modelfamilies lezen elk dezelfde vraag. Een STRENGE treffer is er alleen als beide
 * dezelfde bekende bevinding noemen; een RUIME treffer als een van beide dat doet. De prompt en de regels staan hier vast
 * en zijn onderdeel van de vooraf geregistreerde meting.
 */

export const OORDEELDERS = [
  { naam: 'gpt-oss-120b', model: 'openai/gpt-oss-120b' },
  { naam: 'deepseek-v4-flash', model: 'deepseek/deepseek-v4-flash' },
]

export const SYSTEEM = `You are a strict reviewer comparing one candidate security finding with a list of known, valid findings from an audit contest.
The candidate MATCHES a known finding only if it describes the same root cause in the same code (the same function or contract) and could lead to the same kind of impact.
These are NOT matches: the same topic in general, a generic best-practice remark, a different bug in the same function, or a missing check that is not the flaw the known finding describes.
If you are not sure, answer that there is no match. Answer with JSON only.`

/** De vraag aan de beoordelaar. De bekende bevindingen krijgen hun id, titel en het begin van hun uitleg. */
export function bouwPrompt(hypothese, bekende, { uitleg = 600 } = {}) {
  const h = hypothese
  const kop = `CANDIDATE FINDING
title: ${String(h.title ?? '').slice(0, 200)}
file: ${h.file ?? ''}
function: ${String(h.function ?? '').split('\n')[0].slice(0, 120)}
description: ${String(h.description ?? '').replace(/\s+/g, ' ').slice(0, 900)}`
  const lijst = bekende.map(b => `[${b.id}] ${String(b.title).slice(0, 200)}\n    ${String(b.excerpt ?? '').slice(0, uitleg)}`).join('\n')
  return `${kop}\n\nKNOWN VALID FINDINGS\n${lijst}\n\nDoes the candidate match one of the known findings? Reply with JSON only, in this exact form:\n{"match": "<id of the known finding, for example H-3>" or null, "reason": "<one short sentence>"}`
}

/** Zet een id in een vergelijkbare vorm: hoofdletters, alleen letters en cijfers, geen voorloopnullen ("H-04", "h4" en "H 4" geven dezelfde sleutel). */
export const idSleutel = (x) => String(x ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]+)0+([0-9])/, '$1$2')

/**
 * Leest het antwoord. Het ruwe antwoord blijft ALTIJD bewaard in `ruw` (de eerste 1500 tekens), ook als het wordt weggegooid, zodat een buitenstaander later kan zien wat de
 * beoordelaar schreef (4 nov 2026, na de nameting van Tom Smart van de 56 weggegooide antwoorden in de oudere mappen). Een id dat alleen anders is opgeschreven ("H-4" voor
 * "H-04") wordt gekoppeld aan het ENE bekende id met dezelfde sleutel, met de vlag `genormaliseerd`. Een onbekend id of onleesbare tekst telt als "geen treffer", met een vlag.
 */
export function leesOordeel(tekst, bekende) {
  const t = String(tekst ?? '')
  const ruw = t.slice(0, 1500)
  const m = t.match(/\{[\s\S]*?\}/)
  if (!m) return { match: null, ongeldig: 'geen-json', reden: '', ruw }
  let o
  try { o = JSON.parse(m[0]) } catch { return { match: null, ongeldig: 'json-kapot', reden: '', ruw } }
  const reden = String(o.reason ?? '').slice(0, 200)
  const id = o.match == null || o.match === 'null' ? null : String(o.match).trim()
  if (id === null) return { match: null, reden, ruw }
  if (bekende.some(b => b.id === id)) return { match: id, reden, ruw }
  const gelijk = bekende.filter(b => idSleutel(b.id) === idSleutel(id))
  if (gelijk.length === 1) return { match: gelijk[0].id, genormaliseerd: true, reden, ruw }
  return { match: null, ongeldig: 'onbekend-id', reden, ruw }
}

/**
 * Vraagt een beoordelaar en leest het antwoord. Is het antwoord onleesbaar (geen JSON, kapotte JSON), dan wordt het
 * EENMALIG opnieuw gevraagd met een strengere herinnering, in plaats van meteen weg te gooien (4 nov 2026, koning-wens
 * na de 56 weggegooide antwoorden van Tom Smart). Een ONBEKEND id wordt NIET opnieuw gevraagd: dat is geen leesprobleem
 * maar een verzonnen nummer, en opnieuw vragen zou alleen uitnodigen tot een nieuw verzonnen nummer.
 */
export async function vraagEnLees({ model, sleutel, prompt, bekende, haal = fetch }) {
  const r1 = await vraagBeoordelaar({ model, sleutel, prompt, haal })
  const l1 = leesOordeel(r1.tekst, bekende)
  if (l1.ongeldig !== 'geen-json' && l1.ongeldig !== 'json-kapot') return { ...l1, kosten: r1.kosten }
  const herinnering = prompt + '\n\nYour previous answer could not be read as JSON. Reply with JSON only, in exactly the form shown above, nothing before or after it.'
  const r2 = await vraagBeoordelaar({ model, sleutel, prompt: herinnering, haal })
  const l2 = leesOordeel(r2.tekst, bekende)
  return { ...l2, kosten: r1.kosten + r2.kosten, herhaald: true }
}

/** Een beoordelaar aanroepen via OpenRouter. `sleutel` komt uit de omgeving en wordt nooit getoond. */
export async function vraagBeoordelaar({ model, sleutel, prompt, haal = fetch }) {
  for (let poging = 1; poging <= 2; poging++) {
    const r = await haal('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${sleutel}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 2500, messages: [{ role: 'system', content: SYSTEEM }, { role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(120_000),
    })
    if (r.ok) {
      const d = await r.json()
      const tekst = d?.choices?.[0]?.message?.content ?? ''
      if (tekst.trim()) return { tekst, kosten: Number(d?.usage?.cost ?? 0) }
    }
    await new Promise(res => setTimeout(res, 1500))
  }
  return { tekst: '', kosten: 0 }
}

/** Moeilijkheid naar aantal vinders: makkelijk >= 5, midden 3 tot 4, moeilijk 1 tot 2. */
export const niveau = (finders) => finders >= 5 ? 'makkelijk' : finders >= 3 ? 'midden' : 'moeilijk'

/**
 * Zijn a en b het oneens (of is een van beide weggegooid), dan beslist de derde rechter `c` WELKE van de twee gelijk
 * heeft, mits hij zelf niet weggegooid is en hetzelfde zegt als een van de twee. Zegt hij iets anders, of is hij er zelf
 * ook niet uit, dan blijft het oneens: een derde mening alleen is geen bevestiging (4 nov 2026, dezelfde reden als
 * waarom twee weggegooide antwoorden geen overeenstemming zijn, geldt ook hier als a EN b allebei weggegooid zijn).
 */
export function beslisVoor(a, b, c) {
  if (!c || c.ongeldig) return undefined
  if (!a.ongeldig && c.match === a.match) return a.match
  if (!b.ongeldig && c.match === b.match) return b.match
  return undefined
}

/**
 * Zuivere telling. `oordelen[i]` hoort bij hypothese i en heeft `a` en `b` (de twee beoordelaars), en optioneel `c`
 * (de derde rechter, alleen gevraagd bij onenigheid). `streng`/`strengeHyp`/`precisieStreng`/`recallStreng` komen
 * ALLEEN van a en b: dat is de bevroren Two-Judge Strict Rule (MEASUREMENT-RULE-two-judge-strict.md, punt 4) en mag
 * niet stilzwijgend ruimer worden zodra er een derde rechter bij komt. Wat de derde rechter bij onenigheid oplost
 * staat apart in `gevondenStrengMetDerde`/`derdeBeslist`: een diagnostisch getal, nooit het koptal.
 */
export function scoor(hypotheses, bekende, oordelen) {
  const streng = new Set(), ruim = new Set(), strengMetDerde = new Set()
  let strengeHyp = 0, ruimeHyp = 0, eens = 0, ongeldig = 0, derdeBeslist = 0
  hypotheses.forEach((_, i) => {
    const { a, b, c } = oordelen[i]
    if (a.ongeldig) ongeldig++
    if (b.ongeldig) ongeldig++
    // Twee weggegooide antwoorden zijn geen overeenstemming: alleen twee bruikbare antwoorden die gelijk zijn tellen (4 nov 2026, de 100 procent van layeredge in dev-set-2).
    const directEens = !a.ongeldig && !b.ongeldig && a.match === b.match
    if (directEens) {
      eens++
      if (a.match) { streng.add(a.match); strengeHyp++; strengMetDerde.add(a.match) }
    } else {
      const d = beslisVoor(a, b, c)
      if (d !== undefined) { derdeBeslist++; if (d) strengMetDerde.add(d) }
    }
    if (a.match || b.match) { if (a.match) ruim.add(a.match); if (b.match) ruim.add(b.match); ruimeHyp++ }
  })
  const perNiveau = {}
  for (const n of ['makkelijk', 'midden', 'moeilijk']) {
    const lijst = bekende.filter(b => niveau(b.finders) === n)
    perNiveau[n] = { totaal: lijst.length, streng: lijst.filter(b => streng.has(b.id)).length, ruim: lijst.filter(b => ruim.has(b.id)).length }
  }
  return {
    hypotheses: hypotheses.length, bekend: bekende.length,
    gevondenStreng: [...streng].sort(), gevondenRuim: [...ruim].sort(), gevondenStrengMetDerde: [...strengMetDerde].sort(),
    recallStreng: bekende.length ? streng.size / bekende.length : 0, recallRuim: bekende.length ? ruim.size / bekende.length : 0,
    precisieStreng: hypotheses.length ? strengeHyp / hypotheses.length : 0, precisieRuim: hypotheses.length ? ruimeHyp / hypotheses.length : 0,
    overeenstemming: hypotheses.length ? eens / hypotheses.length : 1, derdeBeslist, ongeldigeAntwoorden: ongeldig, perNiveau,
  }
}
