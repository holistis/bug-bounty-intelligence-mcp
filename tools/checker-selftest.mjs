#!/usr/bin/env node
// checker-selftest.mjs: tests the checkers, not the numbers.
// For every folder under results/ that has a check.mjs it copies the folder to a temp directory, checks that the unchanged copy passes, plants a fault,
// recomputes SHA256SUMS (so the hash list does not catch the edit first, as when a stranger updates it too), and runs check.mjs again.
// Faults: (1) a made-up finding id (H-999) in both judges' answers of a strict match, (2) a flipped verdict of the grader copy (detected true becomes false and the other way round).
// CAUGHT: check.mjs failed on the planted fault. BLIND: it passed, so that checker accepts this kind of fault. N/A: the layout of the folder has nothing to plant. NOT MEASURABLE: the unchanged copy already fails.
// Usage: node tools/checker-selftest.mjs [path-to-results]      exit 0 when nothing is blind, 1 when at least one checker is blind.
// To see our first result (three of the five reachable checkers blind) check out commit 0fafa23 and run it; on main only results/2026-10-26-evmbench is blind until its known ids are added.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { loadPolicy, verifyFolder } from './verify-manifests.mjs'

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

// The four faults a careful stranger tries next (4 Nov 2026): the hash list itself, a cut-off file, a missing file and a row counted twice.
const verdictFiles = (copy) => files(copy, (f) => /hypothesis-verdicts|verdicts|\/judge\//.test(f.replace(/\\/g, "/")))

export function emptyHashList(copy) {
  const p = join(copy, "SHA256SUMS")
  if (!existsSync(p) || readFileSync(p, "utf8").trim() === "") return null
  writeFileSync(p, "")
  return p
}
emptyHashList.keepHashes = true

// A nonempty list can still leave evidence unhashed. Keep the file, omit only its unique hash entry.
export function omitHashEntry(copy) {
  const p = join(copy, 'SHA256SUMS')
  if (!existsSync(p)) return null
  const lines = readFileSync(p, 'utf8').split(/\r?\n/)
  const entries = lines.map((line, i) => ({ i, file: line.match(/^[0-9a-f]{64}\s+\*?(.+)$/)?.[1] })).filter((e) => e.file)
  if (entries.length < 2) return null
  const entry = entries.find((e) => existsSync(join(copy, e.file)) && entries.filter((x) => x.file === e.file).length === 1)
  if (!entry) return null
  lines.splice(entry.i, 1)
  writeFileSync(p, lines.join('\n'))
  return p
}
omitHashEntry.keepHashes = true

// The other half of an omission, in the same spirit: nothing visible changes, the list just stops matching the folder.
// A file nobody listed.
export function addUnlistedFile(copy) {
  const p = join(copy, 'SHA256SUMS')
  if (!existsSync(p)) return null
  const extra = join(copy, 'unlisted-extra-evidence.json')
  writeFileSync(extra, '{"added":"after the list was written"}\n')
  return extra
}
addUnlistedFile.keepHashes = true

// A line for a file that is not there.
export function addDanglingEntry(copy) {
  const p = join(copy, 'SHA256SUMS')
  if (!existsSync(p)) return null
  const text = readFileSync(p, 'utf8')
  writeFileSync(p, text + (text.endsWith('\n') ? '' : '\n') + createHash('sha256').update('nothing').digest('hex') + '  vanished-evidence.json\n')
  return p
}
addDanglingEntry.keepHashes = true

// Two lines that keep their hashes but trade file names.
export function swapEntryNames(copy) {
  const p = join(copy, 'SHA256SUMS')
  if (!existsSync(p)) return null
  const lines = readFileSync(p, 'utf8').split(/\r?\n/)
  const rows = lines.map((line, i) => { const m = line.match(/^([0-9a-f]{64})(\s+\*?)(.+)$/); return m ? { i, hash: m[1], sep: m[2], file: m[3] } : null }).filter((r) => r && existsSync(join(copy, r.file)))
  const a = rows[0]
  const b = a && rows.find((r) => r.file !== a.file && r.hash !== a.hash)
  if (!b) return null
  lines[a.i] = a.hash + a.sep + b.file
  lines[b.i] = b.hash + b.sep + a.file
  writeFileSync(p, lines.join('\n'))
  return p
}
swapEntryNames.keepHashes = true

export function truncateFile(copy) {
  for (const p of verdictFiles(copy)) {
    const text = readFileSync(p, "utf8")
    if (text.length < 40) continue
    writeFileSync(p, text.slice(0, Math.floor(text.length / 2)))
    return p
  }
  return null
}

export function deleteFile(copy) {
  const [p] = verdictFiles(copy)
  if (!p) return null
  rmSync(p)
  return p
}

export function duplicateRow(copy) {
  for (const p of verdictFiles(copy)) {
    let j
    try { j = JSON.parse(readFileSync(p, "utf8")) } catch { continue }
    const rows = Array.isArray(j) ? j : Array.isArray(j?.verdicts) ? j.verdicts : null
    if (!rows || rows.length === 0) continue
    rows.push(structuredClone(rows[0]))
    writeFileSync(p, JSON.stringify(j))
    return p
  }
  return null
}

// A careful stranger who edits a file also updates the hash list, so after planting a fault the list is recomputed (a deleted file loses its line). The hash list must not be the thing that catches the fault.
export function rehash(copy) {
  const p = join(copy, 'SHA256SUMS')
  if (!existsSync(p)) return
  const out = []
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const m = line.match(/^([0-9a-f]{64})(\s+\*?)(.+)$/)
    if (!m) { out.push(line); continue }
    const f = join(copy, m[3].replace(/^\*/, ''))
    if (!existsSync(f)) continue
    out.push(createHash('sha256').update(Buffer.from(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'))).digest('hex') + m[2] + m[3])
  }
  writeFileSync(p, out.join('\n') + '\n')
}

// A folder counts as catching a fault when its own check.mjs fails or the manifest verifier does (tools/verify-manifests.mjs): the old check.mjs files only hash what the list names.
const POLICY = loadPolicy()
const run = (dir, name) => {
  const r = spawnSync(process.execPath, ['check.mjs'], { cwd: dir, encoding: 'utf8', timeout: 60000 })
  const status = r.status ?? 2
  if (status !== 0) return status
  return verifyFolder(dir, name, POLICY).length === 0 ? 0 : 1
}

export const FAULTS = { "made-up id": plantFakeId, "flipped verdict": flipVerdict, "empty hash list": emptyHashList, "cut-off file": truncateFile, "missing file": deleteFile, "duplicate row": duplicateRow, "missing hash entry": omitHashEntry, "unlisted file": addUnlistedFile, "dangling entry": addDanglingEntry, "swapped names": swapEntryNames }

export function testFolder(source, faults = FAULTS) {
  const result = {}
  const folder = basename(source)
  for (const [name, plant] of Object.entries(faults)) {
    const root = mkdtempSync(join(tmpdir(), 'selftest-'))
    const copy = join(root, 'folder')
    try {
      cpSync(source, copy, { recursive: true })
      if (run(copy, folder) !== 0) { result[name] = 'NOT MEASURABLE'; continue }
      if (!plant(copy)) { result[name] = 'N/A'; continue }
      if (!plant.keepHashes) rehash(copy)
      result[name] = run(copy, folder) !== 0 ? 'CAUGHT' : 'BLIND'
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
