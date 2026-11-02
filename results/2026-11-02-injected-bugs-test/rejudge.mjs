#!/usr/bin/env node
// rejudge.mjs: asks YOUR model the same question our two open judges answered, for every hypothesis in this folder, and compares with our published verdicts.
// Usage: node rejudge.mjs --base-url https://openrouter.ai/api/v1 --model <model id> --key-env <name of the environment variable that holds your key> [--set tare] [--limit 10] [--dry-run]
// Any OpenAI-compatible chat completions endpoint works. Each call is one short prompt; the whole folder is one call per hypothesis.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i === -1 ? d : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]) }
const base = arg('base-url', ''), model = arg('model', ''), keyEnv = arg('key-env', ''), only = arg('set', ''), limit = Number(arg('limit', 0)), dry = process.argv.includes('--dry-run')
if (!dry && (!base || !model || !keyEnv || !process.env[keyEnv])) { console.error('usage: node rejudge.mjs --base-url <url> --model <id> --key-env <ENV_NAME> [--set tare|monetrix|intuition] [--limit N] [--dry-run]'); process.exit(2) }
const read = (...p) => JSON.parse(fs.readFileSync(path.join(HERE, ...p), 'utf8'))
const SYSTEM = `You are a strict reviewer comparing one candidate security finding with a list of known, valid findings from an audit contest.
The candidate MATCHES a known finding only if it describes the same root cause in the same code (the same function or contract) and could lead to the same kind of impact.
These are NOT matches: the same topic in general, a generic best-practice remark, a different bug in the same function, or a missing check that is not the flaw the known finding describes.
If you are not sure, answer that there is no match. Answer with JSON only.`
const prompt = (h, known) => `CANDIDATE FINDING
title: ${String(h.title ?? '').slice(0, 200)}
file: ${h.file ?? ''}
function: ${String(h.function ?? '').split('\n')[0].slice(0, 120)}
description: ${String(h.description ?? '').replace(/\s+/g, ' ').slice(0, 900)}

KNOWN VALID FINDINGS
${known.map((b) => `[${b.id}] ${String(b.title).slice(0, 200)}\n    ${String(b.description ?? '').slice(0, 600)}`).join('\n')}

Does the candidate match one of the known findings? Reply with JSON only, in this exact form:
{"match": "<id of the known finding, for example H-3>" or null, "reason": "<one short sentence>"}`
const rows = read('table.json').rows.filter((r) => !only || r.set === only)
let agree = 0, total = 0, errors = 0
for (const r of rows) {
  const known = read('known', r.set + '.json'), hyps = read('hypotheses', r.run + '__' + r.audit + '.json').hypotheses
  const published = read('hypothesis-verdicts', r.run + '__' + r.audit + '.json').verdicts
  const found = new Set(); let matching = 0, judged = 0
  for (let i = 0; i < (limit ? Math.min(limit, hyps.length) : hyps.length); i++) {
    if (dry) { console.log(SYSTEM + '\n\n' + prompt(hyps[i], known)); process.exit(0) }
    const res = await fetch(base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env[keyEnv] }, body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt(hyps[i], known) }] }) })
    if (!res.ok) { errors++; continue }
    const text = (await res.json())?.choices?.[0]?.message?.content ?? ''
    let id = null
    try { const m = text.match(/\{[\s\S]*?\}/); id = m ? JSON.parse(m[0]).match : null } catch { id = null }
    if (id && !known.some((b) => b.id === id)) id = null
    if (id) { matching++; found.add(id) }
    const pub = published[i]; const pubStrict = pub.a?.match && pub.a.match === pub.b?.match ? pub.a.match : null
    total++; judged++; if ((id ?? null) === (pubStrict ?? null)) agree++
  }
  console.log(`${r.audit}: your model judged ${judged} of ${hyps.length} hypotheses, matched ${matching} of those and found ${found.size} of ${known.length} bugs${r.kind === 'ctl' ? ' (clean control: the bugs are not there, so every match is a false match)' : ''}`)
}
console.log(`agreement with our strict verdicts: ${agree} of ${total} judged hypotheses`)
if (errors) { console.error(`${errors} calls failed and are not counted; the result is incomplete`); process.exit(1) }
