import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseManifest, verifyAll, verifyFolder } from './verify-manifests.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const sha = (s) => createHash('sha256').update(s).digest('hex')
const NONE = { noManifest: [], legacyUnlisted: {} }
const CRLF = String.fromCharCode(13, 10)
const FILES = { 'a.json': '{"a":1}\n', 'b.json': '{"b":2}\n', 'sub/c.txt': 'c\n' }

function folder(t, files = FILES, manifest = Object.keys(files)) {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
  if (manifest !== null) writeFileSync(join(dir, 'SHA256SUMS'), manifest.map((n) => sha(files[n]) + '  ' + n).join('\n') + '\n')
  return dir
}
const say = (problems) => problems.join(' | ')

test('parseManifest reads both separators, the ./ prefix, CRLF, and reports what it cannot read', () => {
  const h = sha('x')
  const { entries, bad } = parseManifest(h + '  a.json' + CRLF + h + ' *./b.json' + CRLF + '# comment' + CRLF + CRLF + 'junk line' + CRLF)
  assert.deepEqual(entries.map((e) => e.file), ['a.json', 'b.json'])
  assert.deepEqual(bad, ['junk line'])
})

test('a complete list passes', (t) => {
  assert.deepEqual(verifyFolder(folder(t), 'x', NONE), [])
})

test('one line removed from a non-empty list is reported: the omission Darja Rihla found', (t) => {
  const dir = folder(t, FILES, ['a.json', 'sub/c.txt'])
  assert.match(say(verifyFolder(dir, 'x', NONE)), /b\.json is not named in SHA256SUMS/)
})

test('a file nobody listed is reported, also in a subfolder', (t) => {
  const dir = folder(t, FILES, ['a.json', 'b.json'])
  assert.match(say(verifyFolder(dir, 'x', NONE)), /sub\/c\.txt is not named/)
})

test('a line for a file that is not there is reported', (t) => {
  const dir = folder(t)
  appendFileSync(join(dir, 'SHA256SUMS'), sha('nothing') + '  gone.json\n')
  assert.match(say(verifyFolder(dir, 'x', NONE)), /gone\.json is listed but missing/)
})

test('a changed file is reported', (t) => {
  const dir = folder(t)
  writeFileSync(join(dir, 'a.json'), '{"a":2}\n')
  assert.match(say(verifyFolder(dir, 'x', NONE)), /hash of a\.json does not match/)
})

test('the same file listed twice is reported', (t) => {
  const dir = folder(t)
  appendFileSync(join(dir, 'SHA256SUMS'), sha(FILES['a.json']) + '  a.json\n')
  assert.match(say(verifyFolder(dir, 'x', NONE)), /a\.json is listed twice/)
})

test('an empty list, and a list with only comments, name no files', (t) => {
  assert.match(say(verifyFolder(folder(t, FILES, []), 'x', NONE)), /names no files/)
  const dir = folder(t)
  writeFileSync(join(dir, 'SHA256SUMS'), '# nothing here\n')
  assert.match(say(verifyFolder(dir, 'x', NONE)), /names no files/)
})

test('a line that is not a hash line is reported', (t) => {
  const dir = folder(t)
  appendFileSync(join(dir, 'SHA256SUMS'), 'this is not a hash line\n')
  assert.match(say(verifyFolder(dir, 'x', NONE)), /unreadable line/)
})

test('the * marker, the ./ prefix and CRLF line ends are accepted', (t) => {
  const dir = folder(t, { 'a.json': FILES['a.json'] }, null)
  writeFileSync(join(dir, 'SHA256SUMS'), sha(FILES['a.json']) + ' *./a.json' + CRLF)
  assert.deepEqual(verifyFolder(dir, 'x', NONE), [])
})

test('a path that leaves the folder is reported', (t) => {
  const dir = folder(t)
  appendFileSync(join(dir, 'SHA256SUMS'), sha('x') + '  ../outside.txt\n')
  assert.match(say(verifyFolder(dir, 'x', NONE)), /points outside the folder/)
})

test('a text file that only matches after CRLF becomes LF is a note, not a failure', (t) => {
  const dir = folder(t, { 'a.txt': 'one\ntwo\n' })
  writeFileSync(join(dir, 'a.txt'), 'one' + CRLF + 'two' + CRLF)
  const notes = []
  assert.deepEqual(verifyFolder(dir, 'x', NONE, '', notes), [])
  assert.match(notes.join(' | '), /a\.txt matches its hash only after CRLF/)
})

function nestedFolder(t, { parentLists = true, nestedLists = ['x.txt', 'y.txt'] } = {}) {
  const inner = { 'x.txt': 'x\n', 'y.txt': 'y\n' }
  const dir = folder(t, { 'a.json': FILES['a.json'], 'n/x.txt': inner['x.txt'], 'n/y.txt': inner['y.txt'] }, null)
  const nestedText = nestedLists.map((n) => sha(inner[n]) + '  ' + n).join('\n') + '\n'
  writeFileSync(join(dir, 'n', 'SHA256SUMS'), nestedText)
  const lines = [sha(FILES['a.json']) + '  a.json']
  if (parentLists) lines.push(sha(nestedText) + '  n/SHA256SUMS')
  writeFileSync(join(dir, 'SHA256SUMS'), lines.join('\n') + '\n')
  return dir
}

test('a subfolder with its own complete list passes when the parent names that list', (t) => {
  assert.deepEqual(verifyFolder(nestedFolder(t), 'x', NONE), [])
})

test('a nested list the parent does not name is reported, so it cannot be swapped', (t) => {
  assert.match(say(verifyFolder(nestedFolder(t, { parentLists: false }), 'x', NONE)), /n\/SHA256SUMS is not named/)
})

test('a nested list that misses a file is reported with the nested folder in the message', (t) => {
  assert.match(say(verifyFolder(nestedFolder(t, { nestedLists: ['x.txt'] }), 'x', NONE)), /x\/n: y\.txt is not named/)
})

test('a gap named in the policy is allowed, with the path from the top folder', (t) => {
  const dir = folder(t, FILES, ['a.json', 'sub/c.txt'])
  assert.deepEqual(verifyFolder(dir, 'old', { noManifest: [], legacyUnlisted: { old: ['b.json'] } }), [])
})

test('a policy entry whose file is gone, or that is now named in the list, is a failure', (t) => {
  const dir = folder(t)
  assert.match(say(verifyFolder(dir, 'old', { noManifest: [], legacyUnlisted: { old: ['gone.txt'] } })), /the file is gone/)
  assert.match(say(verifyFolder(dir, 'old', { noManifest: [], legacyUnlisted: { old: ['a.json'] } })), /now named in SHA256SUMS/)
})

test('a folder without a list fails unless the policy names it, and a policy that denies an existing list fails', (t) => {
  const dir = folder(t, FILES, null)
  assert.match(say(verifyFolder(dir, 'x', NONE)), /there is no SHA256SUMS/)
  assert.deepEqual(verifyFolder(dir, 'x', { noManifest: ['x'], legacyUnlisted: {} }), [])
  assert.match(say(verifyFolder(folder(t), 'x', { noManifest: ['x'], legacyUnlisted: {} })), /but there is one/)
})

test('the real result folders and the real policy pass, so a new folder cannot skip its list', () => {
  const result = verifyAll(join(HERE, '..', 'results'))
  const problems = Object.values(result).flat()
  assert.deepEqual(problems, [])
})
