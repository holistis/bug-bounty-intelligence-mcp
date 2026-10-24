import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFindings } from './bug-intel-scope.mjs'

const blok = (extra = '') => `Intro tekst
---FINDING---
TITLE: Reentrancy in withdraw
SEVERITY: High
CATEGORY: ORDERING
FILE: Vault.sol
FUNCTION: withdraw()
DESCRIPTION: First line of the description.
Second line of the description.
ATTACK_PATH: 1. call withdraw
2. reenter
IMPACT: funds drained
RECOMMENDATION: add a guard
CONFIDENCE: 0.82
---END---${extra}`

test('gewone bevinding, meerregelige velden blijven heel', () => {
  const r = parseFindings(blok())
  assert.equal(r.length, 1)
  assert.equal(r[0].function, 'withdraw()')
  assert.equal(r[0].description, 'First line of the description.\nSecond line of the description.')
  assert.equal(r[0].attackPath, '1. call withdraw\n2. reenter')
  assert.equal(r[0].confidence, 0.82)
})

test('leeg FUNCTION-veld blijft leeg en leest de volgende regel niet mee', () => {
  const t = blok().replace('FUNCTION: withdraw()', 'FUNCTION:')
  const r = parseFindings(t)
  assert.equal(r[0].function, '')
  assert.ok(r[0].description.startsWith('First line'))
})

test('FUNCTION zonder spatie na de dubbele punt', () => {
  const r = parseFindings(blok().replace('FUNCTION: withdraw()', 'FUNCTION:withdraw()'))
  assert.equal(r[0].function, 'withdraw()')
})

test('lage zekerheid valt af, meerdere bevindingen, rommel eromheen', () => {
  const t = blok() + '\n---FINDING---\nTITLE: B\nSEVERITY: Low\nFILE: A.sol\nCONFIDENCE: 0.2\n---END---\n---FINDING---\nTITLE: C\nFILE: C.sol\nCONFIDENCE: 0.5\n---END---'
  const r = parseFindings(t)
  assert.deepEqual(r.map(x => x.title), ['Reentrancy in withdraw', 'C'])
})

test('een regel in de tekst die op een sleutel lijkt maar er geen is, breekt niets', () => {
  const t = blok().replace('Second line of the description.', 'NOTE: this is part of the text.')
  const r = parseFindings(t)
  assert.ok(r[0].description.includes('NOTE: this is part of the text.'))
})

test('geen bevindingen en lege invoer', () => {
  assert.deepEqual(parseFindings(''), [])
  assert.deepEqual(parseFindings('niets gevonden'), [])
  assert.deepEqual(parseFindings(null), [])
})
