#!/usr/bin/env node
// checker-selftest.mjs: tests the checkers, not the numbers.
// For every folder under results/ that has a check.mjs it copies the folder to a temp directory, empties SHA256SUMS (so the hash list does not catch the edit first),
// checks that the unchanged copy passes, plants a fault, and runs check.mjs again.
// Faults: (1) a made-up finding id (H-999) in both judges' answers of a strict match, (2) a flipped verdict of the grader copy (detected true becomes false and the other way round).
// CAUGHT: check.mjs failed on the planted fault. BLIND: it passed, so that checker accepts this kind of fault. N/A: the layout of the folder has nothing to plant. NOT MEASURABLE: the unchanged copy already fails.
// Usage: node tools/checker-selftest.mjs [path-to-results]      exit 0 when nothing is blind, 1 when at least one checker is blind.
// To see our first result (three of the five reachable checkers blind) check out commit 0fafa23 and run it; on main only results/2026-10-26-evmbench is blind until its known ids are added.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKIP = new Set(['raw', 'node_modules'])

function files(dir, test, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, test, out)
    else if (e.name.endsWith('.json') && test(p)) out.push(p)
  }
  return out
}

export function plantFakeId(copy) {
  for (const p of files(copy, (f) => /hypothesis-verdicts|judge|hypothesesLijst|verdicts/.test(f.replace(/\\/g, '/')))) {
    let j
    try { j = JSON.parse(readFileSync(p, 'utf8')) } catch { continue }
    let done = false
    const walk = (o) => {
      if (done) return
      if (Array.isArray(o)) { o.forEach(walk); return }
      if (!o || typeof o !== 'object') return
      if (o.a && o.b && typeof o.a.match === 'string' && o.a.match === o.b.match) { o.a.match = 'H-999'; o.b.match = 'H-999'; done = true; return }
      for (const k of Object.keys(o)) walk(o[k])
    }
    walk(j)
    if (done) { writeFileSync(p, JSON.stringify(j)); return p }
  }
  return null
}

export function flipVerdict(copy) {
  for (const p of files(copy, (f) => /verdicts/.test(f.replace(/\\/g, '/')))) {
    let j
    try { j = JSON.parse(readFileSync(p, 'utf8')) } catch { continue }
    if (typeof j?.detected === 'boolean') { j.detected = !j.detected; writeFileSync(p, JSON.stringify(j)); return p }
  }
  return null
}

const run = (dir) => { const r = spawnSync(process.execPath, ['check.mjs'], { cwd: dir, encoding: 'utf8', timeout: 60000 }); return r.status ?? 2 }

export function testFolder(source, faults = { 'made-up id': plantFakeId, 'flipped verdict': flipVerdict }) {
  const result = {}
  for (const [name, plant] of Object.entries(faults)) {
    const root = mkdtempSync(join(tmpdir(), 'selftest-'))
    const copy = join(root, 'folder')
    try {
      cpSync(source, copy, { recursive: true })
      if (existsSync(join(copy, 'SHA256SUMS'))) writeFileSync(join(copy, 'SHA256SUMS'), '')
      if (run(copy) !== 0) { result[name] = 'NOT MEASURABLE'; continue }
      if (!plant(copy)) { result[name] = 'N/A'; continue }
      result[name] = run(copy) !== 0 ? 'CAUGHT' : 'BLIND'
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
  return result
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\//g, '\\').replace(/^\\/, '') || process.argv[1]?.endsWith('checker-selftest.mjs')) {
  const base = process.argv[2] ?? join(HERE, '..', 'results')
  let blind = 0
  for (const d of readdirSync(base, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort()) {
    if (!existsSync(join(base, d, 'check.mjs'))) continue
    const r = testFolder(join(base, d))
    blind += Object.values(r).filter((v) => v === 'BLIND').length
    console.log(d.padEnd(52), Object.entries(r).map(([k, v]) => k + ': ' + v).join(' | '))
  }
  console.log(blind === 0 ? 'No checker is blind.' : blind + ' planted fault(s) accepted: that checker is blind to this kind of fault.')
  process.exit(blind === 0 ? 0 : 1)
}
