import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { FAULTS, addDanglingEntry, addUnlistedFile, swapEntryNames } from './checker-selftest.mjs'
import { verifyFolder } from './verify-manifests.mjs'

const sha = (s) => createHash('sha256').update(s).digest('hex')
const NONE = { noManifest: [], legacyUnlisted: {} }

function fixture(t, withList = true) {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-faults-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const files = { 'first.json': '{"v":1}\n', 'second.json': '{"v":2}\n' }
  for (const [n, text] of Object.entries(files)) writeFileSync(join(dir, n), text)
  const sums = join(dir, 'SHA256SUMS')
  if (withList) writeFileSync(sums, Object.entries(files).map(([n, text]) => sha(text) + '  ' + n).join('\n') + '\n')
  return { dir, sums }
}

test('the three new faults are registered and keep the hash list as planted', () => {
  assert.equal(FAULTS['unlisted file'], addUnlistedFile)
  assert.equal(FAULTS['dangling entry'], addDanglingEntry)
  assert.equal(FAULTS['swapped names'], swapEntryNames)
  for (const f of [addUnlistedFile, addDanglingEntry, swapEntryNames]) assert.equal(f.keepHashes, true)
})

test('without a hash list none of them plants anything', (t) => {
  const { dir } = fixture(t, false)
  for (const f of [addUnlistedFile, addDanglingEntry, swapEntryNames]) assert.equal(f(dir), null)
  assert.equal(existsSync(join(dir, 'unlisted-extra-evidence.json')), false)
  assert.equal(existsSync(join(dir, 'SHA256SUMS')), false)
})

test('an unlisted file leaves the list untouched and the verifier reports the file', (t) => {
  const { dir, sums } = fixture(t)
  const before = readFileSync(sums, 'utf8')
  assert.equal(addUnlistedFile(dir), join(dir, 'unlisted-extra-evidence.json'))
  assert.equal(readFileSync(sums, 'utf8'), before)
  assert.match(verifyFolder(dir, 'x', NONE).join(' | '), /unlisted-extra-evidence\.json is not named/)
})

test('a dangling entry adds one line for a file that is not there and the verifier reports it', (t) => {
  const { dir, sums } = fixture(t)
  const before = readFileSync(sums, 'utf8').split('\n').filter(Boolean).length
  assert.equal(addDanglingEntry(dir), sums)
  assert.equal(readFileSync(sums, 'utf8').split('\n').filter(Boolean).length, before + 1)
  assert.match(verifyFolder(dir, 'x', NONE).join(' | '), /vanished-evidence\.json is listed but missing/)
})

test('swapped names keep both hashes, trade the names, and the verifier sees two wrong hashes', (t) => {
  const { dir, sums } = fixture(t)
  assert.equal(swapEntryNames(dir), sums)
  const lines = readFileSync(sums, 'utf8').split('\n').filter(Boolean)
  assert.equal(lines[0], sha('{"v":1}\n') + '  second.json')
  assert.equal(lines[1], sha('{"v":2}\n') + '  first.json')
  assert.equal(verifyFolder(dir, 'x', NONE).filter((p) => /does not match/.test(p)).length, 2)
})

test('swapping needs two different entries: one entry, or two with the same hash, stays untouched', (t) => {
  const one = fixture(t)
  writeFileSync(one.sums, sha('{"v":1}\n') + '  first.json\n')
  assert.equal(swapEntryNames(one.dir), null)
  const same = fixture(t)
  writeFileSync(join(same.dir, 'second.json'), '{"v":1}\n')
  writeFileSync(same.sums, sha('{"v":1}\n') + '  first.json\n' + sha('{"v":1}\n') + '  second.json\n')
  assert.equal(swapEntryNames(same.dir), null)
})

test('tools/README.md says ten kinds of fault, so the self-test must plant exactly ten', () => {
  assert.equal(Object.keys(FAULTS).length, 10)
  assert.match(readFileSync(new URL('./README.md', import.meta.url), 'utf8'), /Plants ten kinds of fault/)
})

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SELFTEST = fileURLToPath(new URL('./checker-selftest.mjs', import.meta.url))

function resultsWith(t, checkSource) {
  const base = mkdtempSync(join(tmpdir(), 'selftest-cli-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const dir = join(base, '2026-11-06-fixture')
  mkdirSync(dir)
  writeFileSync(join(dir, 'check.mjs'), checkSource)
  writeFileSync(join(dir, 'data.json'), '{"n":1}\n')
  const lines = ['check.mjs', 'data.json'].map((n) => sha(readFileSync(join(dir, n), 'utf8')) + '  ' + n)
  writeFileSync(join(dir, 'SHA256SUMS'), lines.join('\n') + '\n')
  return base
}

test('the self-test exits 1 when a folder cannot be measured, because a checker that cannot be tested is an open gap', (t) => {
  const base = resultsWith(t, 'process.exit(1)\n')
  const r = spawnSync(process.execPath, [SELFTEST, base], { encoding: 'utf8', timeout: 60000 })
  assert.equal(r.status, 1)
  assert.match(r.stdout, /could not be measured/)
  assert.doesNotMatch(r.stdout, /No checker is blind/)
})

test('the self-test exits 0 for a folder whose checker catches every planted fault it can plant', (t) => {
  const base = resultsWith(t, 'process.exit(0)\n')
  const r = spawnSync(process.execPath, [SELFTEST, base], { encoding: 'utf8', timeout: 60000 })
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stdout, /No checker is blind/)
  assert.match(r.stdout, /missing hash entry: CAUGHT/)
})
