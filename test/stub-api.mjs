// Voorgeladen module voor de tests (node --import): vervangt fetch naar https://x402.tokenizen.nl door
// een nepserver, zodat de betaalde weg getest kan worden zonder echte betaling en zonder netwerk.
// STUB_MODE: challenge | accept-payment | refuse-payment | no-payto | server-error | network-error | settle-false | empty-200 | accepted-202 | client-error
// STUB_LOG: pad van een bestand waar elk verzoek als een JSON-regel in komt.
import { appendFileSync } from 'node:fs'

const API = 'https://x402.tokenizen.nl'
const PAY_TO = '0x000000000000000000000000000000000000dEaD'
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const echteFetch = globalThis.fetch

function challenge(extra = {}) {
  return {
    x402Version: 2,
    error: 'PAYMENT-SIGNATURE header is required',
    resource: { url: `${API}/api/bug-intel`, description: 'test', mimeType: 'application/json' },
    accepts: [{ scheme: 'exact', network: 'eip155:8453', amount: '5000000', maxAmountRequired: '5000000', asset: USDC, payTo: PAY_TO, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } }],
    extensions: { bazaar: { info: {} } },
    stripe_alternative: { url: 'https://example.invalid/not-passed-on' },
    ...extra,
  }
}

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

globalThis.fetch = async (url, opts = {}) => {
  if (!String(url).startsWith(API)) return echteFetch(url, opts)
  const header = opts.headers?.['PAYMENT-SIGNATURE'] ?? null
  if (process.env.STUB_LOG) appendFileSync(process.env.STUB_LOG, JSON.stringify({ url: String(url), method: opts.method ?? 'GET', paymentSignature: header, body: opts.body ?? null, redirect: opts.redirect ?? null }) + '\n')
  const mode = process.env.STUB_MODE ?? 'challenge'
  if (mode === 'server-error') return json(503, { error: 'unavailable' })
  if (mode === 'empty-200' && header) return new Response('', { status: 200 })
  if (mode === 'accepted-202' && header) return json(202, { jobId: 'bi-test-3', status: 'queued' })
  if (mode === 'client-error' && header) return json(400, { error: 'bad request' })
  if (mode === 'network-error' && header) throw new TypeError('fetch failed')
  if (mode === 'settle-false' && header) return json(200, { jobId: 'bi-test-2', status: 'queued' }, { 'PAYMENT-RESPONSE': Buffer.from(JSON.stringify({ success: false, errorReason: 'insufficient_funds', network: 'eip155:8453' })).toString('base64') })
  if (mode === 'no-payto') return json(402, { x402Version: 2, accepts: [{ scheme: 'exact', network: 'eip155:8453' }] })
  if (mode === 'refuse-payment') return json(402, challenge({ error: 'invalid payment: signature does not match' }))
  if (mode === 'accept-payment' && header) {
    const receipt = { success: true, transaction: '0x' + 'ab'.repeat(32), network: 'eip155:8453', payer: '0x' + '11'.repeat(20) }
    return json(200, { jobId: 'bi-test-1', status: 'queued' }, { 'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(receipt)).toString('base64') })
  }
  return json(402, challenge())
}
