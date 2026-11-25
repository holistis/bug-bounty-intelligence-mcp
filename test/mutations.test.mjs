// Test de tester: elke bewust gemaakte fout in index.mjs moet de betaalproeven in x402-transport.test.mjs laten falen.
// Slaagt de proef op een beschadigde kopie, dan is de proef blind voor die fout.
// Soorten fouten: weglaten (kop, afrekening, controle), wijzigen (base64, isError), toevoegen (verboden tekst, extra veld, terugval-adres).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const bron = readFileSync('index.mjs', 'utf8').split('\r\n').join('\n')
const milieu = (extra = {}) => { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e }

const MUTANTEN = [
  ['betaalkop weggelaten', "paid.header ? { 'PAYMENT-SIGNATURE': paid.header } : {}", '{}'],
  ['betaling niet als base64 verstuurd', "Buffer.from(JSON.stringify(payment), 'utf8').toString('base64')", 'JSON.stringify(payment)'],
  ['betaaleis niet als fout gemeld', 'isError: true,\n        structuredContent: challenge', 'isError: false,\n        structuredContent: challenge'],
  ['structuredContent weggelaten', '        structuredContent: challenge,\n', ''],
  ['aanwijzing om zelf over te maken terug', "text: JSON.stringify(challenge) }]", "text: 'Pay to: ' + challenge.accepts[0].payTo + ' ' + JSON.stringify(challenge) }]"],
  ['afrekening niet teruggegeven', "...(settlement ? { _meta: { 'x402/payment-response': settlement } } : {})", '...{}'],
  ['geen betaaladres tolereren', "if (!accept?.payTo || !accept?.asset) return null", 'if (false) return null'],
  ['betaling zonder objectcontrole', "if (payment === null || typeof payment !== 'object' || Array.isArray(payment)) {", 'if (false) {'],
  ['extra veld van de API doorgegeven', "['error', 'resource', 'accepts', 'extensions']", "['error', 'resource', 'accepts', 'extensions', 'stripe_alternative']"],
  ['oude beschrijving terug', "Do not send USDC to the address by hand: this tool cannot attach a manual transfer to a scan.", 'If payment_required is true, pay $5 USDC to the payTo address on Base, then retry scan_contract with the same repo_url.'],
  ['betaalkop ook zonder betaling', "paid.header ? { 'PAYMENT-SIGNATURE': paid.header } : {}", "{ 'PAYMENT-SIGNATURE': paid.header ?? 'e30=' }"],
]

for (const [naam, van, naar] of MUTANTEN) {
  test(`mutant "${naam}" wordt door de proeven gevangen`, () => {
    assert.ok(bron.includes(van), `anker voor dit mutant staat niet meer in index.mjs: ${van.slice(0, 60)}`)
    assert.equal(bron.split(van).length - 1, 1, 'anker moet precies een keer voorkomen')
    const pad = resolve('.mutant-index.mjs')
    writeFileSync(pad, bron.replace(van, naar))
    try {
      const r = spawnSync(process.execPath, ['--test', 'test/x402-transport.test.mjs'], { env: milieu({ INDEX_PATH: pad }), encoding: 'utf8', timeout: 90_000 })
      assert.notEqual(r.status, 0, `de proeven slaagden op een beschadigde kopie (${naam}): ze zijn blind voor deze fout`)
    } finally {
      rmSync(pad, { force: true })
    }
  })
}

test('controle: de onbeschadigde index.mjs slaagt wel (anders bewijzen de mutanten niets)', () => {
  const r = spawnSync(process.execPath, ['--test', 'test/x402-transport.test.mjs'], { env: milieu(), encoding: 'utf8', timeout: 90_000 })
  assert.equal(r.status, 0, r.stdout.slice(-800))
})
