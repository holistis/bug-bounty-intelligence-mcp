#!/usr/bin/env node
/**
 * Bug Bounty Intelligence — MCP Server
 *
 * Tools:
 *   scan_contract(repo_url, protocol_type?)  → submit for analysis, returns job_id
 *   get_scan_report(job_id)                  → poll status + get report URL
 *   list_vulnerability_patterns(protocol?)   → show historical patterns from 27K findings
 *
 * Payment: $5 USDC on Base (eip155:8453) via x402, over the x402 MCP transport.
 * scan_contract without a payment returns an error result with the payment requirements; the client
 * signs them and calls again with the signed payment in _meta["x402/payment"].
 *
 * Run: node index.mjs  (or: npx -y bug-bounty-intelligence-mcp@latest)
 */

import { Server }        from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
const API_URL = 'https://x402.tokenizen.nl'

// Embedded pattern library — Sherlock + Code4rena audit-competition findings, updated 2026-11-12.
// Methodology: only contests where the judging repo's own result structure could be exactly
// reconciled (accepted + invalid === total submissions) are included — 35 Sherlock contests
// (7,388 findings) plus 3 Code4rena contests (1,812 findings) that happen to reconcile under
// the same zero-tolerance rule, 38 contests, 9,200 findings total. Code4rena contributes far
// less than Sherlock because most of its history does not use a consistently-applied
// satisfactory/unsatisfactory label (verified by sampling, not assumed), so those contests are
// excluded rather than estimated, exactly like the excluded Sherlock contests. See
// METHODOLOGY.md for the full methodology note, including the 2026-11-12 re-verification that
// replaced an unreliable local cache.
const PATTERN_LIBRARY = {
  'flash-loan':         { acceptance_rate: '0.66', total: 193,  accepted: 127,  examples_accepted: ['duc - Borrower can reduce the interest of shortly loans', 'ShadowForce - Bypass the VAULT_ACCOUNT_MIN_TIME check in VaultAccountAction.sol when exiting the vau', 'mstpr-brainbot - Compound exchange rate can be manipulated to withdraw more underlying tokens from N'] },
  'liquidation':        { acceptance_rate: '0.66', total: 877,  accepted: 576,  examples_accepted: ['w42d3n - The protocol is not protected against Signature malleability', 'gryphon - Buyer may not be able to liquidate the loan', 'peanuts - NFTs are not stored in the appropriate contracts'] },
  'fee-miscalculation': { acceptance_rate: '0.54', total: 583,  accepted: 313,  examples_accepted: ['7siech - Total loss of funds when using certain popular ERC20 tokens', 'iglyx - MigratePrimeCash\'s _calculateInterestRateCurves calculates new kinkRate1 and kinkRate2 incor', 'xiaoming90 - Prime vaults do not consider secondary debt when assessing vault fees'] },
  'oracle-manipulation':{ acceptance_rate: '0.53', total: 949,  accepted: 502,  examples_accepted: ['iglyx - TokenHandler\'s _redeemMoneyMarketIfRequired can fail valid withdrawal requests', 'xiaoming90 - Underlying delta is calculated on internal token balance', 'xiaoming90 - Rebalance stops working when more holdings are added'] },
  'staleness':          { acceptance_rate: '0.51', total: 1315, accepted: 675,  examples_accepted: ['w42d3n - The protocol is not protected against Signature malleability', 'peanuts - Some NFTs like CryptoKitty and CryptoFighter can be paused, which block repaying/liquidati', 'csanuragjain - Liquidation occur at incorrect time'] },
  'mev-slippage':       { acceptance_rate: '0.47', total: 379,  accepted: 179,  examples_accepted: ['xiaoming90 - Liquidation discount does not take slippage into consideration', 'xiaoming90 - Inadequate slippage control', 'ShadowForce - Bypass the VAULT_ACCOUNT_MIN_TIME check in VaultAccountAction.sol when exiting the vau'] },
  'trusted-actor':      { acceptance_rate: '0.47', total: 2127, accepted: 1000, examples_accepted: ['gryphon - Buyer may not be able to liquidate the loan', 'peanuts - Some NFTs like CryptoKitty and CryptoFighter can be paused, which block repaying/liquidati', 'Go-langer - Init function left open for anyone to call and initialize the protocol.'] },
  'dos-griefing':       { acceptance_rate: '0.47', total: 816,  accepted: 383,  examples_accepted: ['w42d3n - The protocol is not protected against Signature malleability', 'duc - Borrower can reduce the interest of shortly loans', '0xd1r4cde17a - lender gets minInterestsToRepay / loan.nbOfPositions'] },
  'overflow':           { acceptance_rate: '0.43', total: 385,  accepted: 167,  examples_accepted: ['peanuts - Some NFTs like CryptoKitty and CryptoFighter can be paused, which block repaying/liquidati', 'Robert - checkedTransfer In claim() and claimAsBorrower() Functions Can Permanently Lock Tokens', 'Inspex - Denial-of-Service in the liquidation flow results in the collateral NTF will be stuck in th'] },
  'access-control':     { acceptance_rate: '0.42', total: 846,  accepted: 356,  examples_accepted: ['Go-langer - Init function left open for anyone to call and initialize the protocol.', 'Englave - Signature Replay Attack on OfferArgs', 'xiaoming90 - It may be possible to liquidate on behalf of another account'] },
  'rounding':           { acceptance_rate: '0.39', total: 532,  accepted: 205,  examples_accepted: ['usmannk - Borrowers may steal funds from lenders', 'jekapi - Borrower can lock lender assets if offer has large LTV', 'iglyx - MigratePrimeCash\'s _calculateInterestRateCurves calculates new kinkRate1 and kinkRate2 incor'] },
  'reentrancy':         { acceptance_rate: '0.34', total: 332,  accepted: 114,  examples_accepted: ['SPYBOY - A malicious signer can exploite reentrancy while Borrowing', 'glcanvas - Possible reentrancy which allows to write incorrect supplyPositionIndex', 'Robert - A Loan\'s supplyPositionIndex Can Be Duplicated Through Re-entrancy'] },
  'idor':               { acceptance_rate: '0.26', total: 35,   accepted: 9,    examples_accepted: ['0Kage - A borrower with multiple loans of which one is liquidated can withdraw much more than his sh', '0xbepresent - Claimable amount could be sent to the approved address instead the provision/position', 'GimelSec - ClaimFacet.sendShareOfSaleAsSupplier() calculates unfair shares, the money should compe'] },
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function callApi(path, method = 'GET', body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    signal: AbortSignal.timeout(30_000),
    // A signed payment must never follow a redirect to another origin.
    ...(extraHeaders['PAYMENT-SIGNATURE'] ? { redirect: 'error' } : {}),
  }
  if (body) opts.body = JSON.stringify(body)
  try {
    const res  = await fetch(`${API_URL}${path}`, opts)
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = { raw: text } }
    return { status: res.status, ok: res.ok, json, headers: res.headers }
  } catch (err) {
    const reason = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timed out after 30s' : err.message
    return { status: 0, ok: false, json: { error: `Could not reach ${API_URL} (${reason})` }, headers: null }
  }
}

// ── x402 over MCP ────────────────────────────────────────────────────────────
// Spec: github.com/coinbase/x402, specs/transports-v2/mcp.md. The payment travels in
// params._meta["x402/payment"] on the tools/call request. The challenge comes back as a tool
// result with isError true, the PaymentRequired object in structuredContent and the same JSON in
// content[0].text. A settled payment is reported in result._meta["x402/payment-response"].

// The API takes the payment as base64 of the JSON payload in the PAYMENT-SIGNATURE header.
function paymentHeaderFromMeta(meta) {
  const payment = meta?.['x402/payment']
  if (payment === undefined) return { header: null }
  if (payment === null || typeof payment !== 'object' || Array.isArray(payment)) {
    return { error: 'Error: _meta["x402/payment"] must be the signed x402 payment object, not a string, array or null.' }
  }
  return { header: Buffer.from(JSON.stringify(payment), 'utf8').toString('base64') }
}

// Pass on what the API asked for and nothing else. Returns null when the API did not name a
// payment address and asset: never fall back to a hardcoded address, a stale one sends real USDC
// to a wallet nobody is watching.
function challengeFromApi(json) {
  const accept = json?.accepts?.[0]
  if (!accept?.payTo || !accept?.asset) return null
  const challenge = { x402Version: json.x402Version ?? 2 }
  for (const key of ['error', 'resource', 'accepts', 'extensions']) {
    if (json[key] !== undefined) challenge[key] = json[key]
  }
  return challenge
}

function settlementFromHeaders(headers) {
  const raw = headers?.get?.('payment-response') ?? headers?.get?.('x-payment-response')
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) } catch { return null }
}

function ilmPatterns(protocolType) {
  const TYPE = {
    DEX:        ['oracle-manipulation','mev-slippage','rounding','flash-loan','fee-miscalculation','reentrancy'],
    LENDING:    ['oracle-manipulation','liquidation','staleness','rounding','flash-loan','access-control','idor'],
    BRIDGE:     ['access-control','reentrancy','overflow','dos-griefing'],
    GOVERNANCE: ['access-control','dos-griefing','trusted-actor'],
    STAKING:    ['rounding','fee-miscalculation','access-control','overflow','staleness'],
    GENERAL:    ['oracle-manipulation','rounding','access-control','fee-miscalculation','reentrancy','flash-loan','idor'],
  }
  const keys = TYPE[protocolType?.toUpperCase()] ?? TYPE.GENERAL
  return keys.filter(k => PATTERN_LIBRARY[k]).map(k => ({
    pattern:         k,
    acceptance_rate: PATTERN_LIBRARY[k].acceptance_rate,
    total_cases:     PATTERN_LIBRARY[k].total,
    example:         (PATTERN_LIBRARY[k].examples_accepted ?? [])[0]?.slice(0, 120),
  }))
}

// ── MCP server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'bug-bounty-intelligence', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'scan_contract',
      description: [
        'Submit a public GitHub repository for an automated Solidity analysis. The result is a list of AI-generated hypotheses to review by hand. It is not an audit and not a list of confirmed bugs.',
        'The scan reads the files most likely to move funds first, in at most six parts. Tests, mocks, scripts, interfaces and vendored dependencies are left out. The report states what share of the in-scope code was actually read, and a report can say that no hypotheses came out of the part that was read.',
        'Check the repository first, for free: GET https://x402.tokenizen.nl/api/bug-intel/precheck?repo=owner/name says whether the scan counts any Solidity in it and roughly how much of it will be read.',
        'How often the scan finds known issues on closed audit contests, including the misses, is published in the README of the repository (github.com/holistis/bug-bounty-intelligence-mcp). The prompt uses acceptance-rate hints from the 9,200 findings that could be exact-reconciled against contest outcomes, see METHODOLOGY.md.',
        'Cost: $5 USDC on Base (eip155:8453) via x402. Reports usually arrive within the hour. If the scan fails or the report does not help, write to info@holistischadviseur.nl for a new attempt or a refund, see the terms.',
        'Returns a job_id. Use get_scan_report to poll for results.',
        'Payment uses the x402 MCP transport. A call without a payment returns an error result that carries the payment requirements as structured content and as JSON in the first text item. Sign them with an x402 client and call scan_contract again with the signed payment in _meta["x402/payment"]. Do not send USDC to the address by hand: this tool cannot attach a manual transfer to a scan.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          repo_url: {
            type: 'string',
            description: 'Public GitHub repo URL containing Solidity contracts (e.g. https://github.com/org/repo)',
          },
          protocol_type: {
            type: 'string',
            enum: ['DEX', 'LENDING', 'BRIDGE', 'GOVERNANCE', 'STAKING', 'DERIVATIVES', 'GENERAL'],
            description: 'Protocol category for targeted analysis (optional, default GENERAL)',
          },
        },
        required: ['repo_url'],
      },
    },
    {
      name: 'get_scan_report',
      description: [
        'Poll the status of a job_id returned by scan_contract.',
        'Call this every few minutes after submitting. Reports usually arrive within the hour; polling faster just re-checks a job that is still processing.',
        'Returns status (queued/processing/complete/failed), the repo under scan, and once complete the reportUrl (the report of hypotheses, with the share of code that was read), the outcome and the coverage. A failed job says why and where to write for a new attempt or a refund.',
        'A 404 means the job_id does not exist — double-check what scan_contract actually returned rather than retrying blindly.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: 'The job_id returned by scan_contract' },
        },
        required: ['job_id'],
      },
    },
    {
      name: 'list_vulnerability_patterns',
      description: [
        'Returns historical vulnerability patterns and acceptance rates from Sherlock and Code4rena audit-competition findings.',
        'Numbers are limited to contests where results could be exactly reconciled against the platform\'s own published outcomes (9,200 findings across 38 contests: 35 Sherlock, 3 Code4rena), no estimated or unverifiable figures.',
        'Useful for understanding what types of bugs are most likely to be valid in a given protocol type.',
        'This tool is FREE — no payment required.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          protocol_type: {
            type: 'string',
            enum: ['DEX', 'LENDING', 'BRIDGE', 'GOVERNANCE', 'STAKING', 'DERIVATIVES', 'GENERAL'],
            description: 'Protocol type to filter patterns (default GENERAL)',
          },
        },
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params

  // ── scan_contract ──────────────────────────────────────────────────────────
  if (name === 'scan_contract') {
    const { repo_url, protocol_type = 'GENERAL' } = args ?? {}
    if (!repo_url) {
      return { content: [{ type: 'text', text: 'Error: repo_url is required' }], isError: true }
    }

    const paid = paymentHeaderFromMeta(req.params._meta)
    if (paid.error) return { content: [{ type: 'text', text: paid.error }], isError: true }

    const { status, json, headers } = await callApi(
      '/api/bug-intel', 'POST', { repo: repo_url, protocolType: protocol_type },
      paid.header ? { 'PAYMENT-SIGNATURE': paid.header } : {},
    )

    if (status === 402) {
      const challenge = challengeFromApi(json)
      if (!challenge) {
        return {
          content: [{
            type: 'text',
            text: 'PAYMENT REQUIRED, but the server did not return a payment address. Do not guess one. Retry scan_contract; if this repeats, the payment endpoint is broken, not the address.',
          }],
          isError: true,
        }
      }
      // structuredContent and content[0].text carry the same object, as the transport spec asks.
      // When a payment was sent and refused, the API's own `error` says why.
      return {
        isError: true,
        structuredContent: challenge,
        content: [{ type: 'text', text: JSON.stringify(challenge) }],
      }
    }

    if ((status === 200 || status === 201) && typeof json?.jobId === 'string' && json.jobId) {
      const settlement = settlementFromHeaders(headers)
      if (settlement?.success === false) {
        // The transport spec wants a failed settlement reported as an error, never as a delivered scan.
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ x402Version: 2, error: 'Settlement failed', settlement }) }],
        }
      }
      return {
        content: [{
          type: 'text',
          text: [
            `Scan submitted. Job ID: ${json.jobId}`,
            `Status: ${json.status ?? 'queued'}`,
            '',
            `Poll for results: get_scan_report({ job_id: "${json.jobId}" })`,
            `Reports usually arrive within the hour. The report states how much of the code was read.`,
          ].join('\n'),
        }],
        ...(settlement ? { _meta: { 'x402/payment-response': settlement } } : {}),
      }
    }

    if (paid.header && !(status >= 400 && status < 500)) {
      // A signed payment went out and the answer is unknown (no answer, a 5xx, or a success without a job id):
      // the API may or may not have collected it.
      // Say so, so that an agent does not sign a second payment with a new nonce on top of the first.
      return {
        content: [{
          type: 'text',
          text: `The scan was not confirmed (${status === 0 ? 'no answer from the API' : `unexpected answer from the API, HTTP ${status}`}). The signed payment may already have been collected. Do not sign a new payment before you have checked whether the first one went through (look for a USDC transfer from the paying address on Base), or write to info@holistischadviseur.nl with the paying address and the time.`,
        }],
        isError: true,
      }
    }

    return {
      content: [{ type: 'text', text: `API error ${status}: ${JSON.stringify(json).slice(0, 300)}` }],
      isError: true,
    }
  }

  // ── get_scan_report ────────────────────────────────────────────────────────
  if (name === 'get_scan_report') {
    const { job_id } = args ?? {}
    if (!job_id) {
      return { content: [{ type: 'text', text: 'Error: job_id is required' }], isError: true }
    }

    const { status, ok, json } = await callApi(`/api/bug-intel/${encodeURIComponent(job_id)}`)

    if (status === 404) {
      return { content: [{ type: 'text', text: `Job ${job_id} not found. Check the job_id.` }], isError: true }
    }

    if (!ok || !json.status) {
      return {
        content: [{ type: 'text', text: `Could not get status for job ${job_id}: ${json.error ?? `API error ${status}`}. Try again shortly.` }],
        isError: true,
      }
    }

    const lines = [`Job ID: ${job_id}`, `Status: ${json.status}`]
    if (json.repo)      lines.push(`Repo: ${json.repo}`)
    if (json.reportUrl) lines.push(`Report: ${json.reportUrl}`)
    if (json.findingsCount !== undefined) lines.push(`Findings: ${json.findingsCount}`)
    if (json.status === 'queued' || json.status === 'processing') {
      lines.push('', 'Analysis in progress. Try again in a few minutes.')
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }

  // ── list_vulnerability_patterns ───────────────────────────────────────────
  if (name === 'list_vulnerability_patterns') {
    const { protocol_type = 'GENERAL' } = args ?? {}
    const patterns = ilmPatterns(protocol_type)

    if (!patterns || patterns.length === 0) {
      return {
        content: [{ type: 'text', text: 'No patterns found for this protocol type. Try GENERAL.' }],
      }
    }

    const lines = [`Vulnerability patterns for ${protocol_type} protocols (from Sherlock and Code4rena audit findings, exact-reconciled contests only):`, '']
    for (const p of patterns) {
      const pct = Math.round(parseFloat(p.acceptance_rate) * 100)
      lines.push(`${p.pattern.padEnd(24)} ${pct}% accepted (${p.total_cases} cases)`)
      if (p.example) lines.push(`  Example: ${p.example}`)
    }
    lines.push('', 'Run scan_contract to check your contracts against these patterns.')

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
})

// ── start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
// server runs until process exits
