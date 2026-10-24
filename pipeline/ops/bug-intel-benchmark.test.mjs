import test from 'node:test'
import assert from 'node:assert/strict'
import { beoordeel } from './bug-intel-benchmark.mjs'

const basis = (extra = {}) => ({
  jobsAnalyzed: 3, labelsUsed: 4, promptHints: ['AVOID THESE: dos-griefing 20% (1v/4fp)'],
  calibratedPatterns: [{ pattern: 'dos-griefing', total: 5, valid: 1, fp: 4, myPrec: 20, basePrec: 45 }, { pattern: 'reentrancy', total: 3, valid: 2, fp: 1, myPrec: 67, basePrec: 50 }],
  ...extra,
})
const naam = (r, n) => r.checks.find(c => c.naam === n)

test('geldige kandidaat met nieuw bewijs en intacte waarschuwing mag live', () => {
  const k = basis({ jobsAnalyzed: 7, labelsUsed: 6, promptHints: ['AVOID THESE: dos-griefing 18% (1v/5fp)', 'YOUR HIGH-PRECISION PATTERNS: reentrancy 67%'],
    calibratedPatterns: [{ pattern: 'dos-griefing', total: 6, valid: 1, fp: 5, myPrec: 17, basePrec: 45 }, { pattern: 'reentrancy', total: 3, valid: 2, fp: 1, myPrec: 67, basePrec: 50 }] })
  const r = beoordeel(basis(), k)
  assert.equal(r.pass, true, JSON.stringify(r.checks))
})

test('te weinig nieuw bewijs blijft in quarantaine', () => {
  const r = beoordeel(basis(), basis({ jobsAnalyzed: 4, labelsUsed: 5 }))
  assert.equal(naam(r, 'nieuw bewijs').ok, false)
  assert.equal(r.pass, false)
})

test('een waarschuwing die verdwijnt zonder nieuw bewijs wordt geweigerd', () => {
  const k = basis({ jobsAnalyzed: 9, labelsUsed: 8, promptHints: ['iets anders'], calibratedPatterns: [{ pattern: 'reentrancy', total: 3, valid: 2, fp: 1, myPrec: 67, basePrec: 50 }] })
  const r = beoordeel(basis(), k)
  assert.equal(naam(r, 'waarschuwingen blijven').ok, false)
  assert.match(naam(r, 'waarschuwingen blijven').reden, /dos-griefing/)
})

test('een waarschuwing mag verdwijnen als er meer labels zijn en de precisie bewezen hoog is', () => {
  const k = basis({ jobsAnalyzed: 9, labelsUsed: 12, promptHints: ['YOUR HIGH-PRECISION PATTERNS: dos-griefing 60%'],
    calibratedPatterns: [{ pattern: 'dos-griefing', total: 10, valid: 6, fp: 4, myPrec: 60, basePrec: 45 }] })
  const r = beoordeel(basis(), k)
  assert.equal(naam(r, 'waarschuwingen blijven').ok, true)
})

test('een hoge claim onder de basisratio van de bron wordt geweigerd', () => {
  const k = basis({ jobsAnalyzed: 9, labelsUsed: 8, calibratedPatterns: [{ pattern: 'access-control', total: 4, valid: 2, fp: 2, myPrec: 50, basePrec: 58 }, { pattern: 'dos-griefing', total: 5, valid: 1, fp: 4, myPrec: 20, basePrec: 45 }] })
  const r = beoordeel(basis(), k)
  assert.equal(naam(r, 'hoge claims onderbouwd').ok, false)
})

test('een patroon in de hints met maar een label wordt geweigerd', () => {
  const k = basis({ jobsAnalyzed: 9, labelsUsed: 8, promptHints: ['AVOID THESE: dos-griefing 20% (1v/4fp)', 'YOUR HIGH-PRECISION PATTERNS: rounding 100% (1v/0fp)'],
    calibratedPatterns: [{ pattern: 'dos-griefing', total: 5, valid: 1, fp: 4, myPrec: 20, basePrec: 45 }, { pattern: 'rounding', total: 1, valid: 1, fp: 0, myPrec: 100, basePrec: 52 }] })
  const r = beoordeel(basis(), k)
  assert.equal(naam(r, 'geen claims op te weinig labels').ok, false)
})

test('kapotte of lege kandidaat en ontbrekende live versie geven geen fout', () => {
  assert.equal(beoordeel(basis(), null).pass, false)
  assert.equal(beoordeel(basis(), { x: 1 }).pass, false)
  const r = beoordeel(null, basis())
  assert.equal(naam(r, 'nieuw bewijs').ok, true)
})
