import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const expected = process.argv[2];
assert.ok(['accept', 'reject'].includes(expected));

const root = path.resolve(
  'results/2026-11-02-shop-setup-six-more-audits'
);

const tmp = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ossr-001-h999-')
);
const dir = path.join(tmp, 'dataset');

const audit = '2025-05-yearn-ybold';
const name = `kn3__${audit}.json`;

function sha(file) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function runChecker() {
  return spawnSync(
    process.execPath, ['check.mjs'],
    { cwd: dir, encoding: 'utf8' }
  );
}

try {
  fs.cpSync(root, dir, { recursive: true });

  const baseline = runChecker();
  assert.equal(
    baseline.status, 0,
    `Baseline failure: ${baseline.stdout} ${baseline.stderr}`
  );

  const verdictPath = path.join(
    dir, 'hypothesis-verdicts', name
  );
  const tablePath = path.join(dir, 'table.json');
  const knownPath = path.join(
    dir, 'known', `${audit}.json`
  );

  const verdict = JSON.parse(
    fs.readFileSync(verdictPath, 'utf8')
  );
  const table = JSON.parse(
    fs.readFileSync(tablePath, 'utf8')
  );
  const known = JSON.parse(
    fs.readFileSync(knownPath, 'utf8')
  );

  const knownIds = new Set(known.map(x => x.id));
  assert.ok(knownIds.has('H-2'));
  assert.ok(!knownIds.has('H-999'));

  const row = table.rows.find(
    x => x.run === 'kn3' && x.audit === audit
  );

  assert.ok(row);
  assert.deepEqual(row.foundIds, ['H-2']);

  let changed = 0;
  for (const item of verdict.verdicts) {
    if (item.a?.match === 'H-2' &&
        item.b?.match === 'H-2') {
      item.a.match = 'H-999';
      item.b.match = 'H-999';
      if (item.strict === 'H-2') {
        item.strict = 'H-999';
      }
      changed++;
    }
  }

  assert.equal(changed, 1);

  row.foundIds = ['H-999'];

  fs.writeFileSync(
    verdictPath, JSON.stringify(verdict, null, 2) + '\n'
  );
  fs.writeFileSync(
    tablePath, JSON.stringify(table, null, 2) + '\n'
  );

  const manifest = path.join(dir, 'SHA256SUMS');
  const entries = fs.readFileSync(manifest, 'utf8')
    .split('\n')
    .filter(Boolean);

  const updated = entries.map(line => {
    const match = line.match(/^([a-f0-9]{64})(\s+)(.+)$/);
    assert.ok(match, `Invalid SHA entry: ${line}`);
    const name = match[3].replace(/^\*/, '');
    const digest = sha(path.join(dir, name));
    return digest + match[2] + match[3];
  });

  fs.writeFileSync(
    manifest, updated.join('\n') + '\n'
  );

  const result = runChecker();
  const output =
    (result.stdout ?? '') + (result.stderr ?? '');

  console.log('Expected behavior:', expected);
  console.log('Actual exit code:', result.status);
  console.log(output);

  if (expected === 'accept') {
    assert.equal(
      result.status, 0,
      'Expected original checker to accept H-999'
    );
  } else {
    assert.equal(
      result.status, 1,
      'Expected patched checker to reject H-999'
    );
    assert.match(
      output, /unknown finding ID/i,
      'Expected explicit invalid finding-ID message'
    );
  }

  console.log('PASS: expected behavior confirmed');
} finally {
  fs.rmSync(tmp, {
    recursive: true,
    force: true
  });
}
