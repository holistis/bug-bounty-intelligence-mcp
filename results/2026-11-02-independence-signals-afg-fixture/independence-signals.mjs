#!/usr/bin/env node
// independence-signals.mjs: concentration signals over the public grounded-feedback file of AgenticFinanceGraph. Reads one CSV, prints JSON. No network, no key.
//   curl -sO https://raw.githubusercontent.com/AgenticFinanceGraph/agentic-finance-graph-spec/7b3763d/fixtures/erc8004-base-grounded-feedback-2026-11-01.csv
//   node independence-signals.mjs erc8004-base-grounded-feedback-2026-11-01.csv
// These are signals, not proof. A row that follows a payment can come from a rater who is independent of the rated agent or from the same hand, and nothing on chain tells the two apart.
// What the numbers do show is how much of the file rests on how few raters, and what one more row costs.
import { readFileSync } from 'node:fs'

export function parseCsv(s) {
  const rows = []; let f = [], c = '', q = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) { if (ch === '"' && s[i + 1] === '"') { c += '"'; i++ } else if (ch === '"') q = false; else c += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { f.push(c); c = '' }
    else if (ch === '\n') { f.push(c); rows.push(f); f = []; c = '' }
    else if (ch !== '\r') c += ch
  }
  if (c || f.length) { f.push(c); rows.push(f) }
  return rows
}

export function signals(rows) {
  const count = (key) => { const m = new Map(); for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]) }
  const raters = count('rater'), agents = count('agent_id')
  const ratersPerAgent = new Map()
  for (const r of rows) (ratersPerAgent.get(r.agent_id) ?? ratersPerAgent.set(r.agent_id, new Set()).get(r.agent_id)).add(r.rater)
  const amounts = rows.map((r) => Number(r.amount_usd)).filter(Number.isFinite).sort((a, b) => a - b)
  const share = (n) => +(raters.slice(0, n).reduce((s, x) => s + x[1], 0) / rows.length).toFixed(3)
  return {
    rows: rows.length, raters: raters.length, agents: agents.length,
    shareOfLargestRater: share(1), shareOfThreeLargestRaters: share(3),
    agentsWithOneRater: [...ratersPerAgent.values()].filter((s) => s.size === 1).length,
    medianPaymentUsd: amounts[Math.floor(amounts.length / 2)], smallestPaymentUsd: amounts[0], largestPaymentUsd: amounts[amounts.length - 1],
  }
}

if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('independence-signals.mjs')) {
  const file = process.argv[2]
  if (!file) { console.error('usage: node independence-signals.mjs <fixture.csv>'); process.exit(2) }
  const R = parseCsv(readFileSync(file, 'utf8')); const H = R[0]
  const rows = R.slice(1).filter((r) => r.length >= H.length - 1).map((r) => Object.fromEntries(H.map((h, i) => [h, r[i]])))
  console.log(JSON.stringify(signals(rows), null, 2))
}
