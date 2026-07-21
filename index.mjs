#!/usr/bin/env node
/**
 * Bug Bounty Intelligence — MCP Server
 *
 * Tools:
 *   scan_contract(repo_url, protocol_type?)  → submit for analysis, returns job_id
 *   get_scan_report(job_id)                  → poll status + get report URL
 *   list_vulnerability_patterns(protocol?)   → show historical patterns from 27K findings
 *
 * Payment: $5 USDC on Base (eip155:8453) via x402.
 * If you receive a payment_required response, pay to the address shown and retry.
 *
 * Run: node scripts/bug-intel-mcp.mjs
 */

import { Server }        from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
const API_URL = 'https://wazir-x402.duckdns.org'

// Embedded pattern library — Sherlock audit-competition findings, updated 2026-07-21.
// Methodology: only contests where Sherlock's own judging-repo result structure could be
// exactly reconciled (accepted + invalid === total submissions) are included — 10 contests,
// 1,032 findings. A much larger raw corpus exists (27,681 submissions across 105 contests),
// but acceptance could not be verified for the rest without risking a wrong number, so
// those are excluded rather than estimated. See BENCHMARK.md for the full methodology note.
const PATTERN_LIBRARY = {
  'reentrancy':         { acceptance_rate: '0.78', total: 51,  accepted: 40, examples_accepted: ['m4k2 - Reentrancy in GoatPairV1::burn if token is a non-standard ERC20', 'Tonchi - Reentrancy in burn function, as it does not update the state of liquidity', 'C1rdan - hacker can steal fee from LPs'] },
  'overflow':           { acceptance_rate: '0.58', total: 45,  accepted: 26, examples_accepted: ['Fassi_Security - When an order is exactly matched, a buyer can end up paying more', 'mstpr-brainbot - Pairs with MAX_FEE can revert due to rounding inconsistencies', 'irresponsible - Partition rounds up which can cause orders to be unfillable'] },
  'trusted-actor':      { acceptance_rate: '0.51', total: 311, accepted: 159, examples_accepted: ['LTDingZhen - Users can grief fillers by set malicious ValidationContract', 'mstpr-brainbot - Pairs with MAX_FEE can revert due to rounding inconsistencies', 'HSP - Attacker can submit malicious order and user may lose funds'] },
  'fee-miscalculation': { acceptance_rate: '0.50', total: 109, accepted: 55, examples_accepted: ['WangAudit - [H] RubiconFeeController::getFeeOutputs incorrectly creates feeOut', 'turvec - The feeController differs from its specification', 'hals - IG contract can be DoS-ed from minting or burning options'] },
  'staleness':          { acceptance_rate: '0.49', total: 174, accepted: 86, examples_accepted: ['LTDingZhen - Users can grief fillers by set malicious ValidationContract', 'HSP - Attacker can submit malicious order and user may lose funds', 'pkqs90 - Orders with equal decayStartTime and decayEndTime benefit the filler'] },
  'mev-slippage':       { acceptance_rate: '0.49', total: 89,  accepted: 44, examples_accepted: ['ge6a - DOS of IG mint/burn because of _deltaHedgePosition() revert', 'ge6a - Dos through large deposit', 'ge6a - Permanent Dos through trackVaultFee()'] },
  'access-control':     { acceptance_rate: '0.47', total: 74,  accepted: 35, examples_accepted: ['skatas192 - The owner address has never been set which will cause the auth modifier', 'bearonbike - DVP _mint/_burn function could be DoS-ed by FeeManager', 'KingNFT - Attack on FeeManager.trackVaultFee() to make the IG contract'] },
  'flash-loan':         { acceptance_rate: '0.46', total: 13,  accepted: 6,  examples_accepted: ['cawfree - The invariant maxDeposit for a Vault can be exceeded', 'mgf15 - Use of slot0 to get sqrtPriceX96 can lead to price manipulation', 'bughuntoor - Any user can do a AAVE flashloan on behalf of FlashLoanAggregator'] },
  'dos-griefing':       { acceptance_rate: '0.41', total: 156, accepted: 64, examples_accepted: ['ni8mare - execute transactions can be reverted by a malicious user', 'LTDingZhen - Users can grief fillers by set malicious ValidationContract', 'mstpr-brainbot - Pairs with MAX_FEE can revert due to rounding inconsistencies'] },
  'rounding':           { acceptance_rate: '0.40', total: 63,  accepted: 25, examples_accepted: ['mstpr-brainbot - Pairs with MAX_FEE can revert due to rounding inconsistencies', 'KingNFT - Execution of orders would revert unexpectedly', 'blutorque - PartialFillLib::partition() unexpectedly reverts'] },
  'oracle-manipulation':{ acceptance_rate: '0.36', total: 131, accepted: 47, examples_accepted: ['ge6a - DOS of IG mint/burn because of _deltaHedgePosition() revert', 'ge6a - Dos through large deposit', 'jasonxiale - Vault._state.liquidity.totalDeposit can avoid being decreased'] },
  'liquidation':        { acceptance_rate: '0.29', total: 14,  accepted: 4,  examples_accepted: ['M3azad - No updation of _state.liquidity.pendingWithdrawals may lead to abnormal', 'bughuntoor - Liquidation bonus scales exponentially instead of linearly', 'cawfree - Calls to addToBlackList(address,address[]) can be frontrun'] },
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function callApi(path, method = 'GET', body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    signal: AbortSignal.timeout(30_000),
  }
  if (body) opts.body = JSON.stringify(body)
  try {
    const res  = await fetch(`${API_URL}${path}`, opts)
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = { raw: text } }
    return { status: res.status, ok: res.ok, json }
  } catch (err) {
    const reason = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timed out after 30s' : err.message
    return { status: 0, ok: false, json: { error: `Could not reach ${API_URL} (${reason})` } }
  }
}

function ilmPatterns(protocolType) {
  const TYPE = {
    DEX:        ['oracle-manipulation','mev-slippage','rounding','flash-loan','fee-miscalculation','reentrancy'],
    LENDING:    ['oracle-manipulation','liquidation','staleness','rounding','flash-loan','access-control'],
    BRIDGE:     ['access-control','reentrancy','overflow','dos-griefing'],
    GOVERNANCE: ['access-control','dos-griefing','trusted-actor'],
    STAKING:    ['rounding','fee-miscalculation','access-control','overflow','staleness'],
    GENERAL:    ['oracle-manipulation','rounding','access-control','fee-miscalculation','reentrancy','flash-loan'],
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
        'Submit a public GitHub repository for an automated smart contract security analysis.',
        'Trained on 27,681 real findings from Sherlock and Code4rena audits.',
        'Cost: $5 USDC on Base (eip155:8453) via x402.',
        'Returns a job_id. Use get_scan_report to poll for results (ready within 24h).',
        'If payment_required is true, pay $5 USDC to the payTo address on Base, then retry.',
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
      description: 'Poll the status of a previously submitted scan. Returns status (queued/processing/complete) and report URL when complete.',
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
        'Returns historical vulnerability patterns and acceptance rates from Sherlock audit-competition findings.',
        'Numbers are limited to contests where results could be exactly reconciled against Sherlock\'s own published outcomes (1,032 findings across 10 contests) — no estimated or unverifiable figures.',
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

    const { status, json } = await callApi('/api/bug-intel', 'POST', { repo: repo_url, protocolType: protocol_type })

    if (status === 402) {
      const accept  = json.accepts?.[0] ?? {}
      const amtUsdc = accept.amount ? (parseInt(accept.amount) / 1_000_000).toFixed(2) : '5.00'
      return {
        content: [{
          type: 'text',
          text: [
            'PAYMENT REQUIRED to start the scan.',
            '',
            `Amount:  ${amtUsdc} USDC`,
            `Network: Base mainnet (eip155:8453)`,
            `Pay to:  ${accept.payTo ?? '0xdffcC75a674257be6FE1b5549FE52e8f8a6A3A5A'}`,
            `Asset:   USDC — ${accept.asset ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'}`,
            '',
            'After paying, retry scan_contract with the same repo_url.',
            'Terms: https://wazir-x402.duckdns.org/terms',
          ].join('\n'),
        }],
        isError: false,
      }
    }

    if (status === 200 || status === 201) {
      return {
        content: [{
          type: 'text',
          text: [
            `Scan submitted. Job ID: ${json.jobId}`,
            `Status: ${json.status ?? 'queued'}`,
            '',
            `Poll for results: get_scan_report({ job_id: "${json.jobId}" })`,
            `Results are typically ready within 24 hours.`,
          ].join('\n'),
        }],
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

    const lines = [`Vulnerability patterns for ${protocol_type} protocols (from Sherlock audit findings, exact-reconciled contests only):`, '']
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
