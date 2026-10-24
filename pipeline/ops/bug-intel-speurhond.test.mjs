import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseSlither, parseAderyn, maakContextBlok } from './bug-intel-speurhond.mjs'

const echt = JSON.parse(readFileSync(new URL('./slither-voorbeeld.json', import.meta.url), 'utf8'))

test('echte Slither-uitvoer wordt omgezet: reentrancy en willekeurig versturen zijn High', () => {
  const r = parseSlither(echt)
  assert.equal(r.length, 5)
  const re = r.find(x => x.check === 'reentrancy-eth')
  assert.equal(re.severity, 'High')
  assert.equal(re.function, 'withdraw')
  assert.equal(re.contract, 'Vault')
  assert.equal(re.file, 'src/Vault.sol')
  assert.ok(re.lines.includes(8) || re.lines.length > 0)
  assert.equal(r.find(x => x.check === 'arbitrary-send-eth').function, 'sweep')
  assert.equal(r.find(x => x.check === 'solc-version').severity, 'Info')
})

test('dependencies worden weggelaten en lege invoer geeft niets', () => {
  const dep = { results: { detectors: [{ check: 'x', impact: 'High', confidence: 'High', elements: [{ type: 'function', name: 'f', source_mapping: { filename_relative: 'lib/oz/A.sol', lines: [1], is_dependency: true } }] }] } }
  assert.deepEqual(parseSlither(dep), [])
  assert.deepEqual(parseSlither({}), [])
  assert.deepEqual(parseSlither(null), [])
})

test('context-blok is duidelijk gelabeld, zonder Info, op volgorde van ernst, begrensd', () => {
  const blok = maakContextBlok(parseSlither(echt), { max: 3 })
  assert.match(blok, /^STATIC ANALYSIS CONTEXT/)
  assert.match(blok, /not from you/)
  assert.ok(!/solc-version/.test(blok), 'informatieve meldingen horen niet in de prompt')
  assert.ok(blok.indexOf('High') < blok.indexOf('Low') || !blok.includes('Low'))
  assert.equal(blok.split('\n').filter(l => l.startsWith('- ')).length <= 3, true)
  assert.equal(maakContextBlok([]), '')
})

test('Aderyn-formaat (uit de documentatie): tests en dependencies vallen af', () => {
  const j = { high_issues: { issues: [{ title: 'Reentrancy', detector_name: 'reentrancy', description: 'x', instances: [{ contract_path: 'src/A.sol', line_no: 10 }, { contract_path: 'test/A.t.sol', line_no: 3 }, { contract_path: 'lib/x/B.sol', line_no: 1 }] }] }, low_issues: { issues: [] } }
  const r = parseAderyn(j)
  assert.equal(r.length, 1)
  assert.equal(r[0].file, 'src/A.sol')
  assert.equal(r[0].severity, 'High')
  assert.deepEqual(parseAderyn({}), [])
})
