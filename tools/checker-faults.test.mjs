import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { omitHashEntry, FAULTS } from './checker-selftest.mjs'

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hash-entry-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const lines = ['first.json', 'second.json'].map((file, i) => {
    const bytes = JSON.stringify({ value: i }) + '\n'
    writeFileSync(join(dir, file), bytes)
    return createHash('sha256').update(bytes).digest('hex') + '  ' + file
  })
  return { dir, lines, sums: join(dir, 'SHA256SUMS') }
}

test('omit one unique hash entry, retain a valid nonempty list and every evidence byte', (t) => {
  const { dir, lines, sums } = fixture(t)
  writeFileSync(sums, lines.join('\n') + '\n')
  const first = readFileSync(join(dir, 'first.json'))
  const second = readFileSync(join(dir, 'second.json'))
  assert.equal(omitHashEntry(dir), sums)
  assert.equal(readFileSync(sums, 'utf8'), lines[1] + '\n')
  assert.deepEqual(readFileSync(join(dir, 'first.json')), first)
  assert.deepEqual(readFileSync(join(dir, 'second.json')), second)
  const [hash, file] = readFileSync(sums, 'utf8').trim().split('  ')
  assert.equal(createHash('sha256').update(readFileSync(join(dir, file))).digest('hex'), hash)
  assert.equal(FAULTS['missing hash entry'], omitHashEntry)
  assert.equal(omitHashEntry.keepHashes, true)
})

test('missing manifest is N/A without creating one', (t) => {
  const { dir, sums } = fixture(t)
  assert.equal(omitHashEntry(dir), null)
  assert.equal(existsSync(sums), false)
})

test('empty or single-entry list stays untouched: this fault must not empty the list', (t) => {
  const { dir, lines, sums } = fixture(t)
  for (const original of ['', lines[0] + '\n', '# comment\n' + lines[0] + '\n']) {
    writeFileSync(sums, original)
    assert.equal(omitHashEntry(dir), null)
    assert.equal(readFileSync(sums, 'utf8'), original)
  }
})

test('duplicate entries alone cannot remove coverage of a unique file', (t) => {
  const { dir, lines, sums } = fixture(t)
  const original = lines[0] + '\n' + lines[0] + '\n'
  writeFileSync(sums, original)
  assert.equal(omitHashEntry(dir), null)
  assert.equal(readFileSync(sums, 'utf8'), original)
})

test('a path already missing is not selected as the newly unhashed evidence', (t) => {
  const { dir, lines, sums } = fixture(t)
  const original = lines[0] + '\n' + lines[1] + '\n'
  writeFileSync(sums, original)
  rmSync(join(dir, 'first.json'))
  assert.equal(omitHashEntry(dir), sums)
  assert.equal(readFileSync(sums, 'utf8'), lines[0] + '\n')
  assert.equal(existsSync(join(dir, 'second.json')), true)
})
