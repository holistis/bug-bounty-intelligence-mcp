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

/** Leest het antwoord. Een onbekend id of onleesbare tekst telt als "geen treffer", met een vlag. */
export function leesOordeel(tekst, bekende) {
  const t = String(tekst ?? '')
  const m = t.match(/\{[\s\S]*?\}/)
  if (!m) return { match: null, ongeldig: 'geen-json', reden: '' }
  let o
  try { o = JSON.parse(m[0]) } catch { return { match: null, ongeldig: 'json-kapot', reden: '' } }
  const id = o.match == null || o.match === 'null' ? null : String(o.match).trim()
  if (id === null) return { match: null, reden: String(o.reason ?? '').slice(0, 200) }
  if (!bekende.some(b => b.id === id)) return { match: null, ongeldig: 'onbekend-id', reden: String(o.reason ?? '').slice(0, 200) }
  return { match: id, reden: String(o.reason ?? '').slice(0, 200) }
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
 * Zuivere telling. `oordelen[i]` hoort bij hypothese i en heeft `a` en `b` (de twee beoordelaars).
 * Geeft per wedstrijd: gevonden bevindingen (streng en ruim), precisie, overeenstemming, herstel per niveau.
 */
export function scoor(hypotheses, bekende, oordelen) {
  const streng = new Set(), ruim = new Set()
  let strengeHyp = 0, ruimeHyp = 0, eens = 0, ongeldig = 0
  hypotheses.forEach((_, i) => {
    const { a, b } = oordelen[i]
    if (a.ongeldig) ongeldig++
    if (b.ongeldig) ongeldig++
    if (a.match === b.match) eens++
    if (a.match && b.match && a.match === b.match) { streng.add(a.match); strengeHyp++ }
    if (a.match || b.match) { if (a.match) ruim.add(a.match); if (b.match) ruim.add(b.match); ruimeHyp++ }
  })
  const perNiveau = {}
  for (const n of ['makkelijk', 'midden', 'moeilijk']) {
    const lijst = bekende.filter(b => niveau(b.finders) === n)
    perNiveau[n] = { totaal: lijst.length, streng: lijst.filter(b => streng.has(b.id)).length, ruim: lijst.filter(b => ruim.has(b.id)).length }
  }
  return {
    hypotheses: hypotheses.length, bekend: bekende.length,
    gevondenStreng: [...streng].sort(), gevondenRuim: [...ruim].sort(),
    recallStreng: bekende.length ? streng.size / bekende.length : 0, recallRuim: bekende.length ? ruim.size / bekende.length : 0,
    precisieStreng: hypotheses.length ? strengeHyp / hypotheses.length : 0, precisieRuim: hypotheses.length ? ruimeHyp / hypotheses.length : 0,
    overeenstemming: hypotheses.length ? eens / hypotheses.length : 1, ongeldigeAntwoorden: ongeldig, perNiveau,
  }
}
