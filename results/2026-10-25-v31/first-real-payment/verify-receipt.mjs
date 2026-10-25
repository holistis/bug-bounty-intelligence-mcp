// Controleert zelf het bonnetje van de eerste echte betaling, zonder ons te vertrouwen.
//   npm install ethers
//   node verify-receipt.mjs receipt-evidence.json
// Vier dingen: (1) de handtekening van het bonnetje herleidt tot een adres, (2) dat adres is hetzelfde als dat het
// huidige, door het live eindpunt getekende aanbod ondertekent, (3) de transactie in het bonnetje bestaat op Base
// en is een USDC-overboeking naar het ontvangstadres van de dienst, (4) de betaler in het bonnetje is de afzender.
import { createRequire } from 'node:module'
import fs from 'node:fs'
const eisen = [process.cwd() + '/', import.meta.url]
let ethers
for (const basis of eisen) { try { ethers = createRequire(basis)('ethers').ethers; break } catch {} }
if (!ethers) { console.error('ethers ontbreekt: voer eerst "npm install ethers" uit in deze map'); process.exit(2) }

const bewijs = JSON.parse(fs.readFileSync(process.argv[2] ?? 'receipt-evidence.json', 'utf8'))
const bon = bewijs.antwoord.receipt
const DOMEIN = { name: 'x402 receipt', version: '1', chainId: 1 }
const TYPES = { Receipt: [{ name: 'version', type: 'uint256' }, { name: 'network', type: 'string' }, { name: 'resourceUrl', type: 'string' }, { name: 'payer', type: 'string' }, { name: 'issuedAt', type: 'uint256' }, { name: 'transaction', type: 'string' }] }
const OFFER_DOMEIN = { name: 'x402 offer', version: '1', chainId: 1 }
const OFFER_TYPES = { Offer: [{ name: 'version', type: 'uint256' }, { name: 'resourceUrl', type: 'string' }, { name: 'scheme', type: 'string' }, { name: 'network', type: 'string' }, { name: 'asset', type: 'string' }, { name: 'payTo', type: 'string' }, { name: 'amount', type: 'string' }, { name: 'validUntil', type: 'uint256' }] }
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const ONTVANGST = '0x015eb036560216b3051339061ff68a207e0fe88f'
let fout = 0
const toets = (naam, ok, extra = '') => { if (!ok) fout++; console.log((ok ? '  pass  ' : '  FAIL  ') + naam + (extra ? '  ' + extra : '')) }

const herleid = ethers.verifyTypedData(DOMEIN, TYPES, bon.payload, bon.signature)
toets('handtekening van het bonnetje herleidt tot een adres', ethers.isAddress(herleid), herleid)

const live = await (await fetch('https://x402.tokenizen.nl/api/bug-intel')).json()
const aanbod = live.extensions?.['offer-receipt']?.info?.offers?.[0]
const aanbodSigner = aanbod ? ethers.verifyTypedData(OFFER_DOMEIN, OFFER_TYPES, aanbod.payload, aanbod.signature) : null
toets('het live aanbod is door hetzelfde adres getekend', aanbodSigner === herleid, String(aanbodSigner))

const rpc = await (await fetch('https://mainnet.base.org', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [bon.payload.transaction] }) })).json()
const r = rpc.result
toets('de transactie bestaat op Base en is gelukt', !!r && r.status === '0x1', r ? 'blok ' + parseInt(r.blockNumber, 16) : '')
const log = r?.logs?.find(l => l.address.toLowerCase() === USDC && l.topics[0].startsWith('0xddf252ad'))
const van = log ? '0x' + log.topics[1].slice(26) : null
const naar = log ? '0x' + log.topics[2].slice(26) : null
toets('het is een USDC-overboeking naar het ontvangstadres van de dienst', !!naar && naar.toLowerCase() === ONTVANGST, log ? Number(BigInt(log.data)) / 1e6 + ' USDC' : '')
toets('de betaler in het bonnetje is de afzender van die overboeking', !!van && van.toLowerCase() === bon.payload.payer.toLowerCase(), String(van))
console.log(fout ? '\nNIET alles klopt' : '\nAlles klopt. Dit bewijst dat de dienst deze betaling zag en erover tekende; het zegt niets over de kwaliteit van het rapport.')
process.exit(fout ? 1 : 0)
