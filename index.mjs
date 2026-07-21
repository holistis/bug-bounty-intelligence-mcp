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

// Embedded pattern library — 27,681 accepted findings from Sherlock + Code4rena (updated 2026-07-10)
const PATTERN_LIBRARY = {
  'rounding':           { acceptance_rate: '0.51', total: 2615,  accepted: 1327, examples_accepted: ['Long Jetblack Porpoise - wrong calculation of borrowed amount causes migrateFrom', 'Gentle Mango Locust - Duplicate Reward Tokens Can Be Added, Leading to Denial of', 'Tiny Smoke Swift - No Liquidation Incentive for Small Positions'] },
  'oracle-manipulation':{ acceptance_rate: '0.53', total: 3253,  accepted: 1736, examples_accepted: ['Boxy Pickle Corgi - Users lose the latest accrued rewards during migration if pr', 'Tiny Smoke Swift - No Liquidation Incentive for Small Positions', 'Flat Cedar Robin - AbstractYieldStrategy.price() implementation is wrong'] },
  'trusted-actor':      { acceptance_rate: '0.46', total: 8820,  accepted: 4081, examples_accepted: ['Agreeable Pine Porpoise - Double Fee Accrual in Withdrawal Flow Causes Last User', 'Rare Parchment Monkey - Migration of the reward pool will render the strategy co', 'Boxy Pickle Corgi - Users lose the latest accrued rewards during migration'] },
  'fee-miscalculation': { acceptance_rate: '0.56', total: 2676,  accepted: 1505, examples_accepted: ['Clean Gauze Halibut - Incorrect update of s_escrowedShares causes later users', 'Flat Cedar Robin - AbstractYieldStrategy.price() implementation is wrong', 'Generous Sandstone Raven - Escrowed shares and their underlying yield tokens'] },
  'mev-slippage':       { acceptance_rate: '0.54', total: 1874,  accepted: 1006, examples_accepted: ['Wide Lavender Octopus - User can go with less tokens', 'Innocent Mahogany Baboon - Intended slippage parameter for liquidators will not', 'Stale Ebony Reindeer - AbstractSingleSidedLP execution'] },
  'dos-griefing':       { acceptance_rate: '0.49', total: 3702,  accepted: 1796, examples_accepted: ['Long Jetblack Porpoise - wrong calculation of borrowed amount causes migrateFrom', 'Gentle Mango Locust - Duplicate Reward Tokens Can Be Added, Leading to Denial of', 'Fast Quartz Elephant - Shares minted for ERC20 WRM yield strategy deposits'] },
  'access-control':     { acceptance_rate: '0.51', total: 2480,  accepted: 1259, examples_accepted: ['Decent Saffron Woodpecker - Lack of Access Control in updateAccountRewards', 'Tricky Eggplant Orangutan - Cooldown Griefing via Delegated enterPosition', 'Hot Viridian Sidewinder - Transient Storage Authorization Persists After Failed'] },
  'staleness':          { acceptance_rate: '0.45', total: 5838,  accepted: 2649, examples_accepted: ['Jumpy Tartan Guppy - claimRewardToken does not update emission rate claiming', 'Boxy Pickle Corgi - Users lose the latest accrued rewards during migration', 'Joyful Caramel Cuckoo - Attacker Can Reenter Redemption Process'] },
  'reentrancy':         { acceptance_rate: '0.47', total: 979,   accepted: 458,  examples_accepted: ['Joyful Caramel Cuckoo - Attacker Can Reenter Redemption Process', 'Fast Quartz Elephant - Shares minted for ERC20 WRM yield strategy deposits', 'Soaring Carrot Cow - Attacker Will Steal Yield Funds via Reentrancy'] },
  'overflow':           { acceptance_rate: '0.47', total: 1256,  accepted: 586,  examples_accepted: ['Gentle Mango Locust - Duplicate Reward Tokens Can Be Added', 'Stale Ebony Reindeer - AbstractSingleSidedLP execution', 'Tiny Smoke Swift - Liquidation Front-Running via Minimal Repay'] },
  'flash-loan':         { acceptance_rate: '0.53', total: 512,   accepted: 269,  examples_accepted: ['Long Jetblack Porpoise - wrong calculation of borrowed amount causes migrateFrom', 'Fancy Ultraviolet Raccoon - Missing Checks for Flash Loan Callback in _enterPosition', 'Cool Clay Cottonmouth - use of approve(type(uint256).max) in the exit flow'] },
  'liquidation':        { acceptance_rate: '0.53', total: 2502,  accepted: 1319, examples_accepted: ['Generous Sandstone Raven - Liquidators can steal rewards accrued to liquidated', 'Rare Parchment Monkey - Migration of the reward pool will render the strategy', 'Joyful Caramel Cuckoo - Attacker Can Reenter Redemption Process'] },
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function callApi(path, method = 'GET', body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    signal: AbortSignal.timeout(30_000),
  }
  if (body) opts.body = JSON.stringify(body)
  const res  = await fetch(`${API_URL}${path}`, opts)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, ok: res.ok, json }
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
        'Returns historical vulnerability patterns and their acceptance rates from 27,681 real audit findings.',
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

    const { status, json } = await callApi(`/api/bug-intel/${encodeURIComponent(job_id)}`)

    if (status === 404) {
      return { content: [{ type: 'text', text: `Job ${job_id} not found. Check the job_id.` }], isError: true }
    }

    const lines = [`Job ID: ${job_id}`, `Status: ${json.status ?? 'unknown'}`]
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

    const lines = [`Vulnerability patterns for ${protocol_type} protocols (from 27,681 real audit findings):`, '']
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
