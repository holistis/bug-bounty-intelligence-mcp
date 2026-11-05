import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { isLegacy, loadPolicy, parseManifest, verifyAll, verifyFolder } from './verify-manifests.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const sha = (s) => createHash('sha256').update(s).digest('hex')
const NONE = { noManifest: [], legacyUnlisted: {}, looseFiles: [] }
const CRLF = String.fromCharCode(13, 10)
const TAB = String.fromCharCode(9)
const FILES = { 'a.json': '{"a":1}\n', 'b.json': '{"b":2}\n', 'sub/c.txt': 'c\n' }
const OLD = '2026-10-01-old'

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

test('parseManifest reads the sha256sum formats, the ./ prefix, CRLF, and reports what it cannot read', () => {
  const h = sha('x')
  const { entries, bad } = parseManifest(h + '  a.json' + CRLF + h + ' *./b.json' + CRLF + '# comment' + CRLF + CRLF + 'junk line' + CRLF)
  assert.deepEqual(entries.map((e) => e.file), ['a.json', 'b.json'])
  assert.deepEqual(bad, ['junk line'])
})

test('a tab, or a single space without a star, is not a sha256sum line and is reported', () => {
  const h = sha('x')
  const { entries, bad } = parseManifest(h + TAB + 'a.json\n' + h + ' b.json\n')
  assert.equal(entries.length, 0)
  assert.equal(bad.length, 2)
})

test('only a folder dated before 5 November 2026 counts as legacy', () => {
  assert.equal(isLegacy('2026-11-04-x'), true)
  assert.equal(isLegacy('2026-11-05-x'), false)
  assert.equal(isLegacy('x'), false)
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

test('a changed byte cannot hide behind a lossy text decode', (t) => {
  const dir = folder(t, { 'a.txt': 'x\n' }, null)
  const original = Buffer.from([0x41, 0xef, 0xbf, 0xbd, 0x0a])
  writeFileSync(join(dir, 'a.txt'), Buffer.from([0x41, 0x80, 0x0a]))
  writeFileSync(join(dir, 'SHA256SUMS'), sha(original) + '  a.txt\n')
  assert.match(say(verifyFolder(dir, 'x', NONE)), /hash of a\.txt does not match/)
})

test('a policy written without looseFiles does not crash the verifier', (t) => {
  const dir = resultsDir(t)
  assert.doesNotThrow(() => verifyAll(dir, { noManifest: [], legacyUnlisted: {} }))
  assert.doesNotThrow(() => verifyFolder(join(dir, OLD), OLD, {}))
})

test('a gap named in the policy is allowed for an old folder, with the path from the top folder', (t) => {
  const dir = folder(t, FILES, ['a.json', 'sub/c.txt'])
  assert.deepEqual(verifyFolder(dir, OLD, { ...NONE, legacyUnlisted: { [OLD]: ['b.json'] } }), [])
})

test('a policy entry applies to the folder it names and to no other folder', (t) => {
  const dir = folder(t, FILES, ['a.json', 'sub/c.txt'])
  const policy = { ...NONE, legacyUnlisted: { '2026-10-02-other': ['b.json'] } }
  assert.match(say(verifyFolder(dir, OLD, policy)), /b\.json is not named/)
})

test('a new folder, or an undated one, cannot use the policy at all', (t) => {
  const dir = folder(t, FILES, ['a.json', 'sub/c.txt'])
  for (const name of ['2026-11-05-new', 'undated']) {
    const out = say(verifyFolder(dir, name, { ...NONE, legacyUnlisted: { [name]: ['b.json'] } }))
    assert.match(out, /may only name folders dated before 2026-11-05/)
    assert.match(out, /b\.json is not named/)
  }
  const bare = folder(t, FILES, null)
  const out = say(verifyFolder(bare, '2026-11-05-new', { ...NONE, noManifest: ['2026-11-05-new'] }))
  assert.match(out, /may only name folders dated before/)
  assert.match(out, /there is no SHA256SUMS/)
})

test('a policy entry whose file is gone, or that is now named in the list, is a failure', (t) => {
  const dir = folder(t)
  assert.match(say(verifyFolder(dir, OLD, { ...NONE, legacyUnlisted: { [OLD]: ['gone.txt'] } })), /the file is gone/)
  assert.match(say(verifyFolder(dir, OLD, { ...NONE, legacyUnlisted: { [OLD]: ['a.json'] } })), /now named in SHA256SUMS/)
})

test('a policy entry inside a nested folder is checked against that nested list', (t) => {
  const policyFor = (p) => ({ ...NONE, legacyUnlisted: { [OLD]: [p] } })
  assert.deepEqual(verifyFolder(nestedFolder(t, { nestedLists: ['x.txt'] }), OLD, policyFor('n/y.txt')), [])
  assert.match(say(verifyFolder(nestedFolder(t), OLD, policyFor('n/y.txt'))), /n\/y\.txt but it is now named/)
  assert.match(say(verifyFolder(nestedFolder(t, { nestedLists: ['x.txt'] }), OLD, policyFor('n/gone.txt'))), /n\/gone\.txt but the file is gone/)
})

test('a nested list the policy names is checked at the parent level', (t) => {
  const dir = nestedFolder(t)
  assert.match(say(verifyFolder(dir, OLD, { ...NONE, legacyUnlisted: { [OLD]: ['n/SHA256SUMS'] } })), /n\/SHA256SUMS but it is now named/)
  assert.deepEqual(verifyFolder(nestedFolder(t, { parentLists: false }), OLD, { ...NONE, legacyUnlisted: { [OLD]: ['n/SHA256SUMS'] } }), [])
})

test('a folder without a list fails unless the policy names an old folder, and a policy that denies an existing list fails', (t) => {
  const dir = folder(t, FILES, null)
  assert.match(say(verifyFolder(dir, OLD, NONE)), /there is no SHA256SUMS/)
  assert.deepEqual(verifyFolder(dir, OLD, { ...NONE, noManifest: [OLD] }), [])
  assert.match(say(verifyFolder(folder(t), OLD, { ...NONE, noManifest: [OLD] })), /but there is one/)
})

function resultsDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'results-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const complete = join(dir, OLD)
  mkdirSync(complete)
  writeFileSync(join(complete, 'a.json'), FILES['a.json'])
  writeFileSync(join(complete, 'SHA256SUMS'), sha(FILES['a.json']) + '  a.json\n')
  return dir
}

test('a policy that names a folder or a loose file that is not there is reported', (t) => {
  const dir = resultsDir(t)
  const out = verifyAll(dir, { noManifest: ['2026-10-01-gone'], legacyUnlisted: { '2026-10-01-vanished': ['x'] }, looseFiles: ['README.md'] })
  const text = say(out['(policy)'] ?? [])
  assert.match(text, /the folder 2026-10-01-gone/)
  assert.match(text, /the folder 2026-10-01-vanished/)
  assert.match(text, /the loose file README\.md/)
})

test('a loose file in results/ is reported unless the policy names it, and so is a symbolic link', (t) => {
  const dir = resultsDir(t)
  writeFileSync(join(dir, 'stray.json'), '{}\n')
  assert.match(say(verifyAll(dir, NONE)['stray.json'] ?? []), /loose file in results/)
  assert.deepEqual(verifyAll(dir, { ...NONE, looseFiles: ['stray.json'] })['stray.json'] ?? [], [])
  try { symlinkSync(join(dir, OLD), join(dir, 'link'), 'junction') } catch { t.skip('this system does not allow a link here'); return }
  assert.match(say(verifyAll(dir, NONE)['link'] ?? []), /symbolic link/)
})

test('the policy can only shrink: no more than the 3 + 9 + 1 gaps measured on 5 November 2026', () => {
  const p = loadPolicy()
  assert.ok(p.noManifest.length <= 3, 'noManifest grew')
  assert.ok(Object.values(p.legacyUnlisted).flat().length <= 9, 'legacyUnlisted grew')
  assert.ok(p.looseFiles.length <= 1, 'looseFiles grew')
  for (const name of [...p.noManifest, ...Object.keys(p.legacyUnlisted)]) assert.equal(isLegacy(name), true, name + ' is not an old folder')
})

test('the real result folders and the real policy pass, so a new folder cannot skip its list', () => {
  const result = verifyAll(join(HERE, '..', 'results'))
  const problems = Object.values(result).flat()
  assert.deepEqual(problems, [])
})
