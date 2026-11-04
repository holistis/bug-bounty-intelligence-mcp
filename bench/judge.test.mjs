import test from 'node:test'
import assert from 'node:assert/strict'
import { bouwPrompt, leesOordeel, scoor, beslisVoor, niveau, vraagBeoordelaar, vraagEnLees } from './judge.mjs'

const bekend = [
  { id: 'H-1', title: 'Reentrancy in withdraw', finders: 12, excerpt: 'withdraw sends ETH before updating the balance' },
  { id: 'M-2', title: 'Stale oracle price', finders: 4, excerpt: 'latestRoundData is used without a staleness check' },
  { id: 'M-3', title: 'Rounding in fee', finders: 1, excerpt: 'fee rounds down to zero' },
]

test('de prompt noemt de kandidaat en alle bekende bevindingen met hun id', () => {
  const p = bouwPrompt({ title: 'Reentrancy', file: 'Vault.sol', function: 'withdraw()\nDESCRIPTION: rommel', description: 'x '.repeat(600) }, bekend)
  assert.match(p, /CANDIDATE FINDING/)
  assert.match(p, /\[H-1\] Reentrancy in withdraw/)
  assert.match(p, /\[M-3\]/)
  assert.ok(!/rommel/.test(p), 'alleen de eerste regel van het functieveld')
  assert.ok(p.length < 4000)
})

test('antwoorden worden robuust gelezen', () => {
  // Het ruwe antwoord blijft sinds 4 nov 2026 bij elk oordeel bewaard (`ruw`), zodat ook een weggegooid antwoord later te lezen is.
  assert.deepEqual(leesOordeel('{"match": "H-1", "reason": "same bug"}', bekend), { match: 'H-1', reden: 'same bug', ruw: '{"match": "H-1", "reason": "same bug"}' })
  assert.equal(leesOordeel('Sure! ```json\n{"match": null, "reason": "no"}\n```', bekend).match, null)
  assert.equal(leesOordeel('{"match": "null"}', bekend).match, null)
  assert.equal(leesOordeel('{"match": "H-99"}', bekend).ongeldig, 'onbekend-id')
  assert.equal(leesOordeel('geen json', bekend).ongeldig, 'geen-json')
  assert.equal(leesOordeel('{kapot', bekend).ongeldig, 'geen-json')
  assert.equal(leesOordeel('', bekend).match, null)
  assert.equal(leesOordeel('{"match": "H-1" "reason"}', bekend).ongeldig, 'json-kapot')
})

test('streng is beide beoordelaars dezelfde bevinding, ruim is een van beide', () => {
  const hyps = [{}, {}, {}, {}]
  const o = [
    { a: { match: 'H-1' }, b: { match: 'H-1' } },     // streng
    { a: { match: 'M-2' }, b: { match: null } },      // alleen ruim
    { a: { match: 'H-1' }, b: { match: 'M-3' } },     // oneens: ruim voor beide, niet streng
    { a: { match: null }, b: { match: null } },
  ]
  const s = scoor(hyps, bekend, o)
  assert.deepEqual(s.gevondenStreng, ['H-1'])
  assert.deepEqual(s.gevondenRuim, ['H-1', 'M-2', 'M-3'])
  assert.equal(s.recallStreng, 1 / 3)
  assert.equal(s.recallRuim, 1)
  assert.equal(s.precisieStreng, 1 / 4)
  assert.equal(s.precisieRuim, 3 / 4)
  assert.equal(s.overeenstemming, 2 / 4)
  assert.equal(s.perNiveau.makkelijk.streng, 1)
  assert.equal(s.perNiveau.moeilijk.ruim, 1)
})

test('niveaus naar aantal vinders', () => {
  assert.equal(niveau(5), 'makkelijk'); assert.equal(niveau(4), 'midden'); assert.equal(niveau(3), 'midden'); assert.equal(niveau(2), 'moeilijk'); assert.equal(niveau(1), 'moeilijk')
})

test('lege uitkomst van de scan geeft nul en geen fout', () => {
  const s = scoor([], bekend, [])
  assert.equal(s.recallStreng, 0); assert.equal(s.precisieStreng, 0); assert.equal(s.overeenstemming, 1)
})

test('beoordelaar: tweede poging bij een lege tekst, daarna lege uitkomst', async () => {
  let n = 0
  const haal = async () => { n++; return { ok: true, json: async () => ({ choices: [{ message: { content: n === 1 ? '' : '{"match": null}' } }], usage: { cost: 0.001 } }) } }
  const r = await vraagBeoordelaar({ model: 'm', sleutel: 'k', prompt: 'p', haal })
  assert.equal(n, 2); assert.equal(r.tekst, '{"match": null}'); assert.equal(r.kosten, 0.001)
  const leeg = await vraagBeoordelaar({ model: 'm', sleutel: 'k', prompt: 'p', haal: async () => ({ ok: false }) })
  assert.equal(leeg.tekst, '')
})

test('vraagEnLees: een onleesbaar antwoord wordt eenmalig opnieuw gevraagd, met een herinnering in de prompt', async () => {
  const prompts = []
  const haal = async (_url, opts) => {
    const body = JSON.parse(opts.body)
    prompts.push(body.messages[1].content)
    const tekst = prompts.length === 1 ? 'sorry, geen JSON hier' : '{"match": "H-1", "reason": "ok"}'
    return { ok: true, json: async () => ({ choices: [{ message: { content: tekst } }], usage: { cost: 0.001 } }) }
  }
  const r = await vraagEnLees({ model: 'm', sleutel: 'k', prompt: 'ORIGINEEL', bekende: bekend, haal })
  assert.equal(prompts.length, 2)
  assert.match(prompts[1], /ORIGINEEL/)
  assert.match(prompts[1], /could not be read as JSON/)
  assert.equal(r.match, 'H-1')
  assert.equal(r.herhaald, true)
  assert.equal(r.kosten, 0.002)
})

test('vraagEnLees: een ONBEKEND id wordt niet opnieuw gevraagd (geen leesprobleem, een verzonnen nummer)', async () => {
  let pogingen = 0
  const haal = async () => { pogingen++; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"match": "H-99"}' } }], usage: { cost: 0.001 } }) } }
  const r = await vraagEnLees({ model: 'm', sleutel: 'k', prompt: 'p', bekende: bekend, haal })
  assert.equal(pogingen, 1)
  assert.equal(r.ongeldig, 'onbekend-id')
  assert.equal(r.herhaald, undefined)
})

test('beslisVoor: de derde rechter beslist alleen als hij hetzelfde zegt als een van de twee en zelf niet weggegooid is', () => {
  assert.equal(beslisVoor({ match: 'H-1' }, { match: 'M-2' }, { match: 'H-1' }), 'H-1')
  assert.equal(beslisVoor({ match: 'H-1' }, { match: 'M-2' }, { match: 'M-2' }), 'M-2')
  assert.equal(beslisVoor({ match: 'H-1' }, { match: 'M-2' }, { match: 'M-3' }), undefined)
  assert.equal(beslisVoor({ match: 'H-1' }, { match: 'M-2' }, { match: 'H-1', ongeldig: 'geen-json' }), undefined)
  assert.equal(beslisVoor({ match: null, ongeldig: 'geen-json' }, { match: null, ongeldig: 'geen-json' }, { match: 'H-1' }), undefined)
  assert.equal(beslisVoor({ match: 'H-1' }, { match: 'M-2' }, undefined), undefined)
})

test('scoor: de derde rechter verruimt NOOIT gevondenStreng (bevroren Two-Judge Strict Rule), alleen gevondenStrengMetDerde', () => {
  const hyps = [{}, {}, {}, {}]
  const o = [
    { a: { match: 'H-1' }, b: { match: null }, c: { match: 'H-1' } }, // derde bevestigt a: alleen met-derde
    { a: { match: 'H-1' }, b: { match: 'M-3' }, c: { match: 'M-3' } }, // derde bevestigt b: alleen met-derde
    { a: { match: 'H-1' }, b: { match: 'M-3' }, c: { match: null } }, // derde eens met geen van beide: blijft oneens
    { a: { match: null, ongeldig: 'geen-json' }, b: { match: null, ongeldig: 'geen-json' }, c: { match: 'H-1' } }, // beide weggegooid: niet gered
  ]
  const s = scoor(hyps, bekend, o)
  assert.deepEqual(s.gevondenStreng, [], 'twee rechters alleen: geen van de vier was het direct eens')
  assert.deepEqual(s.gevondenStrengMetDerde, ['H-1', 'M-3'])
  assert.equal(s.precisieStreng, 0, 'de derde rechter mag de bevroren Two-Judge Strict Rule niet verruimen')
  assert.equal(s.derdeBeslist, 2)
  assert.equal(s.overeenstemming, 0)
  assert.equal(s.ongeldigeAntwoorden, 2)
})
