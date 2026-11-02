#!/usr/bin/env node
// mutate.mjs: inserts a few known faults into a copy of Solidity code, deterministically for a given seed, and also writes a clean copy as a control.
// Usage: node mutate.mjs <source folder> <output folder> [--seed=2026-11-02] [--n=4] [--max-lines=1200] [--flat]
// With --flat each picked file is written as src/<name>.sol, for projects whose files sit in deeply nested folders. The seed also uses the name of the source folder, so clone into a folder named like the repository.
// Output: <output>/mut (with the faults), <output>/ctl (without) and <output>/mutations.json (what was inserted, per fault).
// Three kinds: remove an access control modifier (onlyX), remove a one-line check (a require or an if-revert), or shift a comparison by one (>= or <=).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const SKIP = /(^|\/)(test|tests|mock|mocks|interfaces?|lib|node_modules|script|scripts|deploy|vendor|dependencies|out|cache|\.git|forge-std|openzeppelin)(\/|$)/i

export function mutate(src, out, { seed = '2026-11-02', n = 4, maxLines = 1200, flat = false } = {}) {
  const name = path.basename(src)
  let h = crypto.createHash('sha256').update(seed + ':' + name).digest().readUInt32LE(0)
  const rnd = () => { h |= 0; h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const files = []
  const walk = (d, rel = '') => {
    for (const e of fs.readdirSync(path.join(d, rel), { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name
      if (SKIP.test(r + (e.isDirectory() ? '/' : ''))) continue
      if (e.isDirectory()) walk(d, r)
      else if (/\.sol$/.test(e.name) && !/^I[A-Z]/.test(e.name)) files.push(r)
    }
  }
  walk(src)
  const perFile = []
  for (const f of files.sort()) {
    const text = fs.readFileSync(path.join(src, f), 'utf8')
    if (!/\b(contract|library)\s+\w+/.test(text)) continue
    const lines = text.split(/\r?\n/)
    const sites = []
    let contract = '', fn = '', nonView = false
    lines.forEach((ln, i) => {
      const t = ln.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      const c = ln.match(/^\s*(?:abstract\s+contract|contract|library)\s+(\w+)\s*(?:is\b|\{)/); if (c) contract = c[1]
      const fm = ln.match(/\bfunction\s+(\w+)\s*\(/)
      if (fm) {
        fn = fm[1]; nonView = !/\b(view|pure)\b/.test(ln)
        const mod = ln.match(/\bonly[A-Z]\w*(\([^)]*\))?/)
        if (mod && /\b(external|public)\b/.test(ln)) sites.push({ type: 'access', i, contract, fn, token: mod[0] })
        return
      }
      if (!fn || !nonView) return
      if (/^\s*require\s*\(.*\)\s*;\s*$/.test(ln) || /^\s*if\s*\(.*\)\s*revert\s+\w+.*;\s*$/.test(ln)) {
        sites.push({ type: 'check', i, contract, fn, text: t })
        if (/>=|<=/.test(ln.replace(/=>/g, ''))) sites.push({ type: 'compare', i, contract, fn, text: t })
      }
    })
    if (sites.length) perFile.push({ f, lines, sites, count: lines.length })
  }
  const base = (f) => f.split('/').pop()
  for (const p of perFile) p.out = flat ? 'src/' + (perFile.filter((q) => base(q.f) === base(p.f)).length > 1 ? p.f.split('/').slice(-2).join('_') : base(p.f)) : p.f
  perFile.sort((a, b) => b.sites.length - a.sites.length || a.f.localeCompare(b.f))
  const chosen = []
  let total = 0
  for (const p of perFile) { if (total + p.count <= maxLines || chosen.length < 1) { chosen.push(p); total += p.count } }
  // pick n faults, alternating the kinds and never two in the same function
  const pool = chosen.flatMap((p) => p.sites.map((s) => ({ ...s, file: p.out, p })))
  const used = new Set(), lineUsed = new Set(), made = []
  const types = ['access', 'check', 'compare']
  for (let k = 0; made.length < n && k < n * 6; k++) {
    const type = types[k % 3]
    const cands = pool.filter((s) => s.type === type && !used.has(s.file + ':' + s.fn) && !lineUsed.has(s.file + ':' + s.i))
    if (!cands.length) continue
    const s = cands[Math.floor(rnd() * cands.length)]
    used.add(s.file + ':' + s.fn); lineUsed.add(s.file + ':' + s.i)
    made.push(s)
  }
  fs.rmSync(out, { recursive: true, force: true })
  const mutations = []
  made.forEach((s, k) => {
    const ln = s.p.lines[s.i]
    const id = 'H-' + String(k + 1).padStart(2, '0')
    let after, title, description
    if (s.type === 'access') {
      after = ln.replace(s.token, '').replace(/[ \t]{2,}/g, ' ')
      title = `${s.contract}.${s.fn}: missing access control`
      description = `In ${s.contract}.${s.fn} (${s.file}) the access control modifier ${s.token} was removed, so any address can call this function.`
    } else if (s.type === 'check') {
      after = ''
      title = `${s.contract}.${s.fn}: missing check`
      description = `In ${s.contract}.${s.fn} (${s.file}) the check "${s.text}" was removed, so the condition is no longer enforced.`
    } else {
      after = ln.replace(/>=/, '>').replace(/(?<!=)<=/, '<')
      if (after === ln) after = ln.replace(/<=/, '<')
      title = `${s.contract}.${s.fn}: off-by-one in a boundary check`
      description = `In ${s.contract}.${s.fn} (${s.file}) the comparison in "${s.text}" was shifted by one (>= became > or <= became <), an off-by-one in a boundary check.`
    }
    mutations.push({ id, type: s.type, file: s.file, contract: s.contract, function: s.fn, line: s.i + 1, before: ln.trim(), after: after.trim(), title, description })
    s.p.mut = (s.p.mut ?? s.p.lines.slice()); s.p.mut[s.i] = after
  })
  for (const p of chosen) {
    for (const [dir, content] of [['ctl', p.lines], ['mut', p.mut ?? p.lines]]) {
      const dest = path.join(out, dir, p.out)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, content.join('\n'))
    }
  }
  fs.writeFileSync(path.join(out, 'mutations.json'), JSON.stringify({ seed, source: name, files: chosen.map((p) => ({ file: p.out, lines: p.count })), mutations }, null, 2) + '\n')
  return { name, files: chosen.length, lines: total, mutations }
}

if (process.argv[1]?.endsWith('mutate.mjs')) {
  const [src, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const arg = (k, d) => (process.argv.find((a) => a.startsWith('--' + k + '=')) ?? '--' + k + '=' + d).split('=')[1]
  if (!src || !out) { console.error('usage: node mutate.mjs <source folder> <output folder> [--seed=] [--n=] [--max-lines=] [--flat]'); process.exit(2) }
  const r = mutate(src, out, { seed: arg('seed', '2026-11-02'), n: Number(arg('n', 4)), maxLines: Number(arg('max-lines', 1200)), flat: process.argv.includes('--flat') })
  console.log(`${r.name}: ${r.files} files, ${r.lines} lines, ${r.mutations.length} faults inserted`)
  for (const m of r.mutations) console.log(`  ${m.id} ${m.type} ${m.file}:${m.line} ${m.contract}.${m.function}`)
}
