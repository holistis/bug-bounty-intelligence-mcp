#!/usr/bin/env node
// verify-manifests.mjs: the hash list (SHA256SUMS) of every result folder must name every file in that folder.
// Why: a list from which one line was removed still passes every check.mjs, because a checker only hashes what the list names
// (found by Darja Rihla, issue 103, 5 November 2026). This tool closes that gap without touching the folders that were published before it.
// Forward-only: the gaps of the old folders are listed by name in tools/manifest-policy.json, and an entry there that is no longer true is itself a failure.
// A subfolder with its own SHA256SUMS is checked on its own; that list must be named by the parent (or by the policy) so it cannot be swapped.
// Text is hashed after CRLF is turned into LF, as the check.mjs files do; a file that only matches that way is reported as a note, because plain sha256sum would disagree.
// Usage: node tools/verify-manifests.mjs [path-to-results]      exit 0 when every list is complete, 1 otherwise.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const MANIFEST = 'SHA256SUMS'
export const POLICY_FILE = join(HERE, 'manifest-policy.json')
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

export function loadPolicy(file = POLICY_FILE) {
  const p = JSON.parse(readFileSync(file, 'utf8'))
  return { noManifest: p.noManifest ?? [], legacyUnlisted: p.legacyUnlisted ?? {} }
}

// Accepts "hash  name", "hash *name" and "./name", with LF or CRLF; blank lines and lines starting with # are ignored, anything else that does not parse is reported.
export function parseManifest(text) {
  const entries = []
  const bad = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([0-9a-fA-F]{64})[ \t]+\*?(.+)$/)
    if (!m) { bad.push(line.slice(0, 80)); continue }
    entries.push({ hash: m[1].toLowerCase(), file: m[2].replace(/^\.\//, '') })
  }
  return { entries, bad }
}

function listFiles(dir, prefix = '') {
  let out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out = out.concat(listFiles(join(dir, e.name), prefix + e.name + '/'))
    else out.push(prefix + e.name)
  }
  return out
}

// rel is the path of this folder inside the top result folder ('' for the top folder itself); the policy is keyed by the top folder name and top-relative paths.
export function verifyFolder(dir, name = basename(dir), policy = loadPolicy(), rel = '', notes = []) {
  const problems = []
  const label = name + (rel ? '/' + rel : '')
  const legacy = policy.legacyUnlisted[name] ?? []
  const manifestPath = join(dir, MANIFEST)
  if (!existsSync(manifestPath)) {
    if (!rel && policy.noManifest.includes(name)) return problems
    return [label + ': there is no ' + MANIFEST]
  }
  if (!rel && policy.noManifest.includes(name)) problems.push(label + ': the policy says there is no ' + MANIFEST + ' but there is one; remove it from noManifest')

  const { entries, bad } = parseManifest(readFileSync(manifestPath, 'utf8'))
  for (const b of bad) problems.push(label + ': unreadable line in ' + MANIFEST + ': ' + b)
  if (entries.length === 0) problems.push(label + ': ' + MANIFEST + ' names no files')

  const listed = new Set()
  for (const e of entries) {
    if (isAbsolute(e.file) || e.file.split('/').includes('..')) { problems.push(label + ': ' + e.file + ' points outside the folder'); continue }
    if (listed.has(e.file)) problems.push(label + ': ' + e.file + ' is listed twice')
    listed.add(e.file)
    const f = join(dir, e.file)
    if (!existsSync(f) || !statSync(f).isFile()) { problems.push(label + ': ' + e.file + ' is listed but missing'); continue }
    const bytes = readFileSync(f)
    if (sha256(bytes) !== e.hash) {
      if (sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))) === e.hash) notes.push(label + ': ' + e.file + ' matches its hash only after CRLF is turned into LF')
      else problems.push(label + ': the hash of ' + e.file + ' does not match')
    }
  }

  const files = listFiles(dir).filter((f) => f !== MANIFEST)
  const nested = files.filter((f) => f.endsWith('/' + MANIFEST)).map((f) => f.slice(0, -(MANIFEST.length + 1)))
  const nestedRoots = nested.filter((r) => !nested.some((o) => o !== r && r.startsWith(o + '/')))
  for (const r of nestedRoots) problems.push(...verifyFolder(join(dir, r), name, policy, rel ? rel + '/' + r : r, notes))

  for (const f of files) {
    if (listed.has(f)) continue
    const full = rel ? rel + '/' + f : f
    const inNested = nestedRoots.find((r) => f.startsWith(r + '/'))
    if (inNested && f !== inNested + '/' + MANIFEST) continue
    if (legacy.includes(full)) continue
    problems.push(label + ': ' + f + ' is not named in ' + MANIFEST)
  }

  if (!rel) {
    for (const p of legacy) {
      if (!existsSync(join(dir, p))) problems.push(label + ': the policy lists ' + p + ' but the file is gone; remove the entry')
      else if (listed.has(p)) problems.push(label + ': the policy lists ' + p + ' but it is now named in ' + MANIFEST + '; remove the entry')
    }
  }
  return problems
}

export function verifyAll(resultsDir, policy = loadPolicy(), notes = []) {
  const out = {}
  const dirs = readdirSync(resultsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  for (const d of dirs) out[d] = verifyFolder(join(resultsDir, d), d, policy, '', notes)
  for (const n of [...policy.noManifest, ...Object.keys(policy.legacyUnlisted)]) {
    if (!dirs.includes(n)) out['(policy)'] = [...(out['(policy)'] ?? []), 'the policy names ' + n + ' but there is no such folder; remove the entry']
  }
  return out
}

const BACKSLASH = String.fromCharCode(92)
if (process.argv[1] && process.argv[1].split(BACKSLASH).join('/').endsWith('verify-manifests.mjs')) {
  const base = process.argv[2] ?? join(HERE, '..', 'results')
  const notes = []
  const result = verifyAll(base, loadPolicy(), notes)
  let bad = 0
  for (const [d, problems] of Object.entries(result)) {
    if (problems.length === 0) { console.log('ok     ' + d); continue }
    bad += problems.length
    for (const p of problems) console.log('FAIL   ' + p)
  }
  for (const n of notes) console.log('note   ' + n)
  console.log(bad === 0 ? 'Every hash list names every file in its folder.' : bad + ' problem(s): a hash list does not cover its folder.')
  process.exit(bad === 0 ? 0 : 1)
}
