import { test } from 'node:test'
import assert from 'node:assert/strict'
import { telStreng, telMap } from './hertel-oudere-mappen.mjs'

test('telStreng: ondergrens ongewijzigd, bovengrens geeft het voordeel van de twijfel aan één weggegooid antwoord', () => {
  const lijst = [
    { a: { match: 'H-1' }, b: { match: 'H-1' } }, // streng, telt in beide
    { a: { match: null, ongeldig: 'geen-json' }, b: { match: 'H-2' } }, // een weggegooid, ander vond iets: alleen bovengrens
    { a: { match: null, ongeldig: 'geen-json' }, b: { match: null, ongeldig: 'geen-json' } }, // beide weggegooid: in geen van beide
    { a: { match: 'H-3' }, b: { match: 'H-4' } }, // oneens, geen van beide weggegooid: in geen van beide
  ]
  const onder = telStreng(lijst, { bovengrens: false })
  const boven = telStreng(lijst, { bovengrens: true })
  assert.equal(onder.streng, 1)
  assert.equal(boven.streng, 2)
  assert.equal(onder.weggegooid, 3)
  assert.equal(onder.hypotheses, 4)
})

test('telStreng: een lege lijst geeft nul, geen fout', () => {
  const r = telStreng([])
  assert.deepEqual(r, { streng: 0, weggegooid: 0, hypotheses: 0 })
})

test('telMap: een map zonder res-*.json (ouder formaat, alleen totalen) wordt eerlijk gemeld, niet als nul geteld', () => {
  const r = telMap(process.cwd(), '2026-10-26-evmbench')
  assert.ok(r.nietGeschikt, 'evmbench heeft geen res-*.json en moet nietGeschikt teruggeven')
})

test('telMap: een echte map (dev-set) geeft dezelfde weggegooide-telling als de gepubliceerde tabel (5)', () => {
  const r = telMap(process.cwd(), '2026-10-24-dev-set')
  assert.equal(r.weggegooid, 5)
  assert.ok(r.strengBovengrens >= r.strengOndergrens)
})
