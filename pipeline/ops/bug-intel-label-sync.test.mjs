import test from 'node:test'
import assert from 'node:assert/strict'
import { statusNaarLabel, bepaalLabels } from './bug-intel-label-sync.mjs'

const jobs = [{ jobId: 'bi-1', protocolType: 'LENDING', findings: [{ id: 0, title: 'Reentrancy in withdraw', severity: 'High', category: 'ORDERING', confidence: 0.9 }, { id: 1, title: 'Stale price', severity: 'Medium', category: 'SETTLEMENT' }] }]
const f = (extra) => ({ id: 'x', status: 'ACCEPTED', scan_job_id: 'bi-1', scan_finding_id: 0, ...extra })

test('uitslag naar label, onbekende status blijft leeg', () => {
  assert.equal(statusNaarLabel('ACCEPTED'), 'valid')
  assert.equal(statusNaarLabel('duplicate'), 'valid')
  assert.equal(statusNaarLabel('REJECTED'), 'false-positive')
  assert.equal(statusNaarLabel('ELIMINATED_TRUSTED_ACTOR'), 'false-positive')
  assert.equal(statusNaarLabel('SUBMITTED'), null)
  assert.equal(statusNaarLabel(undefined), null)
})

test('een geaccepteerde gekoppelde bevinding wordt een label met patroon en protocol', () => {
  const r = bepaalLabels([f()], jobs, [], 123)
  assert.equal(r.nieuw.length, 1)
  assert.deepEqual({ j: r.nieuw[0].jobId, id: r.nieuw[0].findingId, l: r.nieuw[0].label, p: r.nieuw[0].pattern, t: r.nieuw[0].protocolType, ts: r.nieuw[0].ts }, { j: 'bi-1', id: 0, l: 'valid', p: 'reentrancy', t: 'LENDING', ts: 123 })
})

test('bevindingen zonder koppeling worden genegeerd, zonder uitslag overgeslagen', () => {
  const r = bepaalLabels([{ id: 'a', status: 'ACCEPTED' }, f({ status: 'SUBMITTED' })], jobs, [])
  assert.equal(r.nieuw.length, 0)
  assert.equal(r.overgeslagen.length, 1)
  assert.match(r.overgeslagen[0].reden, /nog geen uitslag/)
})

test('idempotent: bestaand label wordt niet dubbel en niet overschreven', () => {
  const bestaand = [{ jobId: 'bi-1', findingId: 0, label: 'false-positive' }]
  const r = bepaalLabels([f({ status: 'ACCEPTED' })], jobs, bestaand)
  assert.equal(r.nieuw.length, 0)
  assert.match(r.overgeslagen[0].reden, /niet overschreven/)
  const r2 = bepaalLabels([f(), f()], jobs, [])
  assert.equal(r2.nieuw.length, 1, 'twee keer dezelfde koppeling geeft een label')
})

test('onbekende scan of bevinding geeft een nette melding, geen fout', () => {
  assert.match(bepaalLabels([f({ scan_job_id: 'bi-nope' })], jobs, []).overgeslagen[0].reden, /niet in het logboek/)
  assert.match(bepaalLabels([f({ scan_finding_id: 9 })], jobs, []).overgeslagen[0].reden, /niet in scan/)
})

test('lege invoer', () => {
  assert.deepEqual(bepaalLabels([], [], []), { nieuw: [], overgeslagen: [] })
})
