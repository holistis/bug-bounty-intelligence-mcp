import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leesOordeel, idSleutel, scoor } from './judge.mjs'
import { kiesRechters, fouten, nieuwstePerModel, familie } from './kies-rechters.mjs'

const BEKENDE = [{ id: 'H-04', title: 'a' }, { id: 'M-9', title: 'b' }, { id: 'M-10', title: 'c' }]

test('een id dat alleen anders is opgeschreven wordt aan het ene bekende id gekoppeld, met een vlag en het ruwe antwoord', () => {
  const l = leesOordeel('{"match": "H-4", "reason": "same bug"}', BEKENDE)
  assert.equal(l.match, 'H-04')
  assert.equal(l.genormaliseerd, true)
  assert.match(l.ruw, /H-4/)
  assert.equal(l.ongeldig, undefined)
})

test('M-09 en m9 en "M 9" zijn dezelfde sleutel als M-9, maar M-10 blijft M-10', () => {
  assert.equal(idSleutel('M-09'), idSleutel('M-9'))
  assert.equal(idSleutel('m9'), idSleutel('M-9'))
  assert.equal(idSleutel('M 9'), idSleutel('M-9'))
  assert.notEqual(idSleutel('M-10'), idSleutel('M-9'))
  assert.equal(leesOordeel('{"match": "M-010", "reason": "x"}', BEKENDE).match, 'M-10')
})

test('een echt onbekend id blijft weggegooid, maar het ruwe antwoord blijft bewaard', () => {
  const l = leesOordeel('{"match": "H-77", "reason": "x"}', BEKENDE)
  assert.equal(l.match, null)
  assert.equal(l.ongeldig, 'onbekend-id')
  assert.match(l.ruw, /H-77/)
})

test('onleesbare tekst en kapotte JSON zijn weggegooid met vlag, en het ruwe antwoord blijft bewaard', () => {
  assert.equal(leesOordeel('geen json hier', BEKENDE).ongeldig, 'geen-json')
  assert.equal(leesOordeel('geen json hier', BEKENDE).ruw, 'geen json hier')
  const k = leesOordeel('{"match": "H-04", ', BEKENDE)
  assert.equal(k.match, null)
  assert.ok(k.ruw.length > 0)
})

test('een precies bekend id en null blijven wat ze waren', () => {
  assert.equal(leesOordeel('{"match": "M-9"}', BEKENDE).match, 'M-9')
  assert.equal(leesOordeel('{"match": null}', BEKENDE).match, null)
  assert.equal(leesOordeel('{"match": "null"}', BEKENDE).ongeldig, undefined)
})

test('een id waarvan twee bekende dezelfde sleutel hebben wordt niet geraden', () => {
  const dubbel = [{ id: 'H-04' }, { id: 'H-4' }]
  const l = leesOordeel('{"match": "h04"}', dubbel)
  assert.equal(l.match, null)
  assert.equal(l.ongeldig, 'onbekend-id')
})

test('twee weggegooide antwoorden tellen niet als overeenstemming', () => {
  const hyp = [{}, {}, {}]
  const goed = { match: 'H-04' }
  const weg = { match: null, ongeldig: 'geen-json' }
  const zonder = { match: null }
  const r = scoor(hyp, [{ id: 'H-04', finders: 1 }], [{ a: goed, b: goed }, { a: weg, b: weg }, { a: zonder, b: zonder }])
  assert.equal(r.overeenstemming, 2 / 3)
  assert.equal(r.ongeldigeAntwoorden, 2)
})

test('scorekaart: de nieuwste regel per model telt en een regel zonder metingen niet', () => {
  const regels = [
    { datum: '2026-10-01', model: 'a/x', naam: 'x', positief: { n: 4, raak: 4, mis: 0, fout: 0 }, negatief: { n: 4, onzin: 2 }, ongeldig: 0, kosten: 0.01 },
    { datum: '2026-11-01', model: 'a/x', naam: 'x', positief: { n: 4, raak: 4, mis: 0, fout: 0 }, negatief: { n: 4, onzin: 0 }, ongeldig: 0, kosten: 0.01 },
    { datum: '2026-11-02', model: 'b/y', naam: 'y', positief: { n: 0 }, negatief: { n: 0 }, kosten: 0 },
  ]
  const n = nieuwstePerModel(regels)
  assert.equal(n.length, 1)
  assert.equal(fouten(n[0]), 0)
})

test('kiezen: het minste aantal fouten wint, dan de laagste kosten, en nooit twee uit dezelfde familie', () => {
  const m = (model, fout, kosten) => ({ datum: '2026-11-04', model, naam: model, positief: { n: 10, raak: 10 - fout, mis: fout, fout: 0 }, negatief: { n: 10, onzin: 0 }, ongeldig: 0, kosten })
  const r = kiesRechters([m('openai/a', 0, 0.05), m('openai/b', 0, 0.01), m('deepseek/c', 1, 0.01), m('qwen/d', 3, 0.001)])
  assert.deepEqual(r.gekozen.map((g) => g.model), ['openai/b', 'deepseek/c'])
  assert.equal(r.genoeg, true)
  assert.equal(familie('Google/Gemini'), 'google')
})

test('te weinig gemeten modellen uit verschillende families geeft geen advies maar zegt wat er mist', () => {
  const m = (model) => ({ datum: '2026-11-04', model, naam: model, positief: { n: 4, raak: 4 }, negatief: { n: 4, onzin: 0 }, kosten: 0 })
  const r = kiesRechters([m('openai/a'), m('openai/b')])
  assert.equal(r.genoeg, false)
  assert.match(r.uitleg, /Te weinig/)
})

test('weggegooide antwoorden tellen als fouten bij de keuze van beoordelaars', () => {
  const schoon = { datum: '2026-11-04', model: 'a/schoon', positief: { n: 4, mis: 0, fout: 0 }, negatief: { n: 4, onzin: 0 }, ongeldig: 0, kosten: 0.02 }
  const rommelig = { datum: '2026-11-04', model: 'b/rommelig', positief: { n: 4, mis: 0, fout: 0 }, negatief: { n: 4, onzin: 0 }, ongeldig: 3, kosten: 0.001 }
  const r = kiesRechters([schoon, rommelig], { aantal: 1 })
  assert.equal(r.gekozen[0].model, 'a/schoon')
})
