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
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname }             from 'node:path'
import { fileURLToPath }             from 'node:url'

const HERE    = dirname(fileURLToPath(import.meta.url))
const BASE    = join(HERE, '..')
const API_URL = 'https://wazir-x402.duckdns.org'

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
  const idx = join(BASE, 'knowledge/3ilm/sherlock/_index.json')
  if (!existsSync(idx)) return null
  try {
    const lib   = JSON.parse(readFileSync(idx, 'utf8')).pattern_library ?? {}
    const TYPE  = {
      DEX:         ['oracle-manipulation','mev-slippage','rounding','flash-loan','fee-miscalculation','reentrancy'],
      LENDING:     ['oracle-manipulation','liquidation','staleness','rounding','flash-loan','access-control'],
      BRIDGE:      ['access-control','reentrancy','overflow','dos-griefing'],
      GOVERNANCE:  ['access-control','dos-griefing','trusted-actor'],
      STAKING:     ['rounding','fee-miscalculation','access-control','overflow','staleness'],
      GENERAL:     ['oracle-manipulation','rounding','access-control','fee-miscalculation','reentrancy','flash-loan'],
    }
    const keys = TYPE[protocolType?.toUpperCase()] ?? TYPE.GENERAL
    return keys.filter(k => lib[k]).map(k => ({
      pattern:         k,
      acceptance_rate: lib[k].acceptance_rate,
      total_cases:     lib[k].total,
      example:         (lib[k].examples_accepted ?? [])[0]?.slice(0, 120),
    }))
  } catch { return null }
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

    if (!patterns) {
      return {
        content: [{ type: 'text', text: 'Pattern library not available locally. Run scan_contract for live analysis.' }],
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
