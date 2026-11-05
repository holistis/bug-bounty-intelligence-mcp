#!/usr/bin/env node
// verify-manifests.mjs: the hash list (SHA256SUMS) of every result folder must name every file in that folder.
// Why: a list from which one line was removed still passes every check.mjs, because a checker only hashes what the list names
// (found by Darja Rihla, issue 103, 5 November 2026). This tool closes that gap without touching the folders that were published before it.
// Forward-only: the gaps of the old folders are listed by name in tools/manifest-policy.json. Only folders dated before LEGACY_BEFORE may be named there,
// so a new folder has to name every file itself, and an entry that is no longer true is itself a failure.
// A subfolder with its own SHA256SUMS is checked on its own; that list must be named by the parent (or by the policy) so it cannot be swapped.
// results/ itself is covered: a loose file or a symbolic link there fails, unless the policy names the file.
// Text is hashed after CRLF is turned into LF, as the check.mjs files do; a file that only matches that way is reported as a note, because plain sha256sum would disagree.
// What it cannot see: a file and its line removed together, or both rewritten. That needs an anchor outside the folder (git history, a timestamp).
// Usage: node tools/verify-manifests.mjs [path-to-results]      exit 0 when every list is complete, 1 otherwise.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const MANIFEST = 'SHA256SUMS'
export const POLICY_FILE = join(HERE, 'manifest-policy.json')
export const LEGACY_BEFORE = '2026-11-05'
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// Turns CRLF into LF on the bytes themselves, without decoding, so a changed byte cannot hide behind a lossy text decode.
function crlfToLf(buf) {
  const out = []
  for (let i = 0; i < buf.length; i++) if (!(buf[i] === 13 && buf[i + 1] === 10)) out.push(buf[i])
  return Buffer.from(out)
}

const withDefaults = (p) => ({ noManifest: p.noManifest ?? [], legacyUnlisted: p.legacyUnlisted ?? {}, looseFiles: p.looseFiles ?? [] })

export function loadPolicy(file = POLICY_FILE) {
  const p = JSON.parse(readFileSync(file, 'utf8'))
  return { noManifest: p.noManifest ?? [], legacyUnlisted: p.legacyUnlisted ?? {}, looseFiles: p.looseFiles ?? [] }
}

// A folder name starts with its date; only folders dated before LEGACY_BEFORE are old enough to be named in the policy.
export function isLegacy(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})-/)
  return Boolean(m) && m[1] < LEGACY_BEFORE
}

// The sha256sum formats only: "hash  name" and "hash *name", with an optional ./ prefix, LF or CRLF. Blank lines and lines starting with # are ignored; anything else is reported.
export function parseManifest(text) {
  const entries = []
  const bad = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line.trim() || line.startsWith('#')) continue
    const m = line.match(/^([0-9a-fA-F]{64}) [ *](.+)$/)
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
  policy = withDefaults(policy)
  const problems = []
  const label = name + (rel ? '/' + rel : '')
  const old = isLegacy(name)
  const legacy = old ? (policy.legacyUnlisted[name] ?? []) : []
  const noManifestOk = old && policy.noManifest.includes(name)
  if (!rel && !old && (policy.noManifest.includes(name) || (policy.legacyUnlisted[name] ?? []).length > 0)) {
    problems.push(label + ': the policy may only name folders dated before ' + LEGACY_BEFORE + '; this folder has to name every file itself')
  }
  const manifestPath = join(dir, MANIFEST)
  if (!existsSync(manifestPath)) {
    if (!rel && noManifestOk) return problems
    return [...problems, label + ': there is no ' + MANIFEST]
  }
  if (!rel && noManifestOk) problems.push(label + ': the policy says there is no ' + MANIFEST + ' but there is one; remove it from noManifest')

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
      if (sha256(crlfToLf(bytes)) === e.hash) notes.push(label + ': ' + e.file + ' matches its hash only after CRLF is turned into LF')
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

  // A policy entry is checked at the level where its file lives: a file inside a nested folder is checked against that nested list, the nested list itself against this one.
  for (const p of legacy) {
    if (rel && !p.startsWith(rel + '/')) continue
    const here = rel ? p.slice(rel.length + 1) : p
    const r = nestedRoots.find((x) => here.startsWith(x + '/'))
    if (r && here !== r + '/' + MANIFEST) continue
    if (!existsSync(join(dir, here))) problems.push(label + ': the policy lists ' + p + ' but the file is gone; remove the entry')
    else if (listed.has(here)) problems.push(label + ': the policy lists ' + p + ' but it is now named in ' + MANIFEST + '; remove the entry')
  }
  return problems
}

export function verifyAll(resultsDir, policy = loadPolicy(), notes = []) {
  policy = withDefaults(policy)
  const out = {}
  const dirents = readdirSync(resultsDir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
  const folders = []
  const looseNames = []
  for (const e of dirents) {
    if (e.isSymbolicLink()) { out[e.name] = [e.name + ': a symbolic link in results/ is not checked; use a real folder']; continue }
    if (e.isDirectory()) { folders.push(e.name); out[e.name] = verifyFolder(join(resultsDir, e.name), e.name, policy, '', notes); continue }
    looseNames.push(e.name)
    if (!policy.looseFiles.includes(e.name)) out[e.name] = [e.name + ': a loose file in results/ is named in no hash list; put it in a folder, or in the policy if it is old']
  }
  const stale = []
  for (const n of [...policy.noManifest, ...Object.keys(policy.legacyUnlisted)]) if (!folders.includes(n)) stale.push('the policy names the folder ' + n + ' but there is no such folder; remove the entry')
  for (const n of policy.looseFiles) if (!looseNames.includes(n)) stale.push('the policy names the loose file ' + n + ' but it is not in results/; remove the entry')
  if (stale.length) out['(policy)'] = stale
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
