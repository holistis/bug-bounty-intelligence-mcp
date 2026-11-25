// Betaalweg van scan_contract over het x402 MCP-transport, zonder echte betaling: de API is een nepserver
// (test/stub-api.mjs). Spec: coinbase/x402, specs/transports-v2/mcp.md.
// INDEX_PATH laat de mutatietest (test/mutations.test.mjs) dezelfde proeven op een bewust beschadigde kopie draaien.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const INDEX = resolve(process.env.INDEX_PATH ?? 'index.mjs')
const STUB = resolve('test/stub-api.mjs')
const PAYMENT = { x402Version: 2, accepted: { scheme: 'exact', network: 'eip155:8453', payTo: '0x000000000000000000000000000000000000dEaD' }, payload: { signature: '0xtest', authorization: { from: '0x' + '22'.repeat(20), nonce: '0x' + '33'.repeat(32) } } }

async function metClient(mode, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'bbi-test-'))
  const log = join(dir, 'verzoeken.jsonl')
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', pathToFileURL(STUB).href, INDEX], env: { ...process.env, STUB_MODE: mode, STUB_LOG: log } })
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(transport)
  try {
    const verzoeken = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
    return await fn(client, verzoeken)
  } finally {
    await client.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const scan = (client, meta) => client.callTool({ name: 'scan_contract', arguments: { repo_url: 'https://github.com/example/repo' }, ...(meta ? { _meta: meta } : {}) })

test('zonder betaling: een foutresultaat met de betaaleisen, in structuredContent en als JSON in content[0], zonder tekst die tot een handmatige overmaking uitnodigt', async () => {
  await metClient('challenge', async (client, verzoeken) => {
    const r = await scan(client)
    assert.equal(r.isError, true)
    assert.equal(r.structuredContent.accepts[0].payTo, '0x000000000000000000000000000000000000dEaD')
    assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent)
    assert.equal(r.content.length, 1)
    const alles = JSON.stringify(r.content)
    assert.ok(!/Pay to|After paying|then retry/i.test(alles), 'geen aanwijzing om zelf over te maken')
    assert.equal('stripe_alternative' in r.structuredContent, false, 'alleen de x402-velden worden doorgegeven')
    assert.equal(verzoeken().length, 1)
    assert.equal(verzoeken()[0].paymentSignature, null, 'zonder betaling gaat er geen betaalkop mee')
  })
})

test('de beschrijving van scan_contract noemt het MCP-transport en nodigt niet uit tot zelf overmaken', async () => {
  await metClient('challenge', async (client) => {
    const { tools } = await client.listTools()
    const d = tools.find((t) => t.name === 'scan_contract').description
    assert.ok(d.includes('_meta["x402/payment"]'))
    assert.ok(!/then retry scan_contract|pay \$5 USDC to the payTo/i.test(d))
    assert.ok(/Do not send USDC to the address by hand/.test(d))
  })
})

test('met betaling in _meta: precies dat object gaat als base64-JSON in PAYMENT-SIGNATURE naar de API en de afrekening komt terug in _meta', async () => {
  await metClient('accept-payment', async (client, verzoeken) => {
    const r = await scan(client, { 'x402/payment': PAYMENT })
    assert.ok(!r.isError)
    assert.match(r.content[0].text, /Job ID: bi-test-1/)
    assert.equal(r._meta['x402/payment-response'].success, true)
    assert.equal(r._meta['x402/payment-response'].transaction, '0x' + 'ab'.repeat(32))
    const v = verzoeken()
    assert.equal(v.length, 1)
    assert.deepEqual(JSON.parse(Buffer.from(v[0].paymentSignature, 'base64').toString('utf8')), PAYMENT)
    assert.deepEqual(JSON.parse(v[0].body), { repo: 'https://github.com/example/repo', protocolType: 'GENERAL' })
  })
})

test('betaling geweigerd door de API: weer een foutresultaat, met de reden van de API erin', async () => {
  await metClient('refuse-payment', async (client) => {
    const r = await scan(client, { 'x402/payment': PAYMENT })
    assert.equal(r.isError, true)
    assert.match(r.structuredContent.error, /invalid payment/)
    assert.equal(r._meta, undefined, 'geen afrekening zonder geslaagde betaling')
  })
})

test('een betaling die geen object is (tekst, lijst, null) wordt geweigerd zonder de API aan te roepen', async () => {
  await metClient('accept-payment', async (client, verzoeken) => {
    for (const slecht of ['0xabc', ['x'], null]) {
      const r = await scan(client, { 'x402/payment': slecht })
      assert.equal(r.isError, true)
      assert.match(r.content[0].text, /must be the signed x402 payment object/)
    }
    assert.equal(verzoeken().length, 0)
  })
})

test('geen betaaladres in het antwoord van de API: hard falen, nooit raden', async () => {
  await metClient('no-payto', async (client) => {
    const r = await scan(client)
    assert.equal(r.isError, true)
    assert.equal(r.structuredContent, undefined)
    assert.match(r.content[0].text, /did not return a payment address/)
  })
})
