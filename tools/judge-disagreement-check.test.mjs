import { test } from 'node:test'
import assert from 'node:assert/strict'
import { telVerdictBuckets } from './judge-disagreement-check.mjs'

test('a strict match (both judges agree) counts as strict, not as disagreement', () => {
  const r = telVerdictBuckets([{ strict: 'H-03', a: { match: 'H-03' }, b: { match: 'H-03' } }])
  assert.deepEqual(r, { totaal: 1, strict: 1, disagreementMetEchteTreffer: 0, geenEnkeleRechter: 0 })
})

test('the real SecondSwap item 5 case: one judge found H-03, the other null, strict is null', () => {
  const r = telVerdictBuckets([{ strict: null, a: { match: 'H-03' }, b: { match: null } }])
  assert.equal(r.disagreementMetEchteTreffer, 1)
  assert.equal(r.strict, 0)
  assert.equal(r.geenEnkeleRechter, 0)
})

test('the real SecondSwap item 6 case: judges disagree on WHICH known finding, both non-null, still counts as disagreement', () => {
  const r = telVerdictBuckets([{ strict: null, a: { match: 'H-02' }, b: { match: 'H-01' } }])
  assert.equal(r.disagreementMetEchteTreffer, 1)
})

test('no judge found anything: both null, strict null', () => {
  const r = telVerdictBuckets([{ strict: null, a: { match: null }, b: { match: null } }])
  assert.deepEqual(r, { totaal: 1, strict: 0, disagreementMetEchteTreffer: 0, geenEnkeleRechter: 1 })
})

test('an empty list gives all zeros, not a crash', () => {
  assert.deepEqual(telVerdictBuckets([]), { totaal: 0, strict: 0, disagreementMetEchteTreffer: 0, geenEnkeleRechter: 0 })
})

test('a candidate missing the a/b fields entirely does not crash and falls into "no judge found anything"', () => {
  const r = telVerdictBuckets([{ strict: null }])
  assert.equal(r.geenEnkeleRechter, 1)
})

test('undefined input (a missing verdicts array) gives all zeros, not a crash', () => {
  assert.deepEqual(telVerdictBuckets(undefined), { totaal: 0, strict: 0, disagreementMetEchteTreffer: 0, geenEnkeleRechter: 0 })
})

test('mixed file: the three buckets sum to the total, each real case counted once', () => {
  const r = telVerdictBuckets([
    { strict: 'H-03', a: { match: 'H-03' }, b: { match: 'H-03' } },
    { strict: null, a: { match: 'H-01' }, b: { match: null } },
    { strict: null, a: { match: null }, b: { match: null } },
    { strict: null, a: { match: null }, b: { match: null } },
  ])
  assert.deepEqual(r, { totaal: 4, strict: 1, disagreementMetEchteTreffer: 1, geenEnkeleRechter: 2 })

  // planted fault: an empty-string strict must NOT be miscounted as a real strict match (it is falsy, same as null)
  const r2 = telVerdictBuckets([{ strict: '', a: { match: 'H-01' }, b: { match: null } }])
  assert.equal(r2.strict, 0)
  assert.equal(r2.disagreementMetEchteTreffer, 1)
})

// Mutation-matrix, actually run by hand (8/8 caught, file reverted after each one, not
// asserted from inside this file — a test file cannot prove it catches mutations of itself):
//   1. `if (a || b)` -> `if (a && b)`                      caught (disagreement count dropped)
//   2. `if (v?.strict) { strict++; continue }` -> drop `continue`
//                                                           caught (strict item double-counted)
//   3. `totaal: (verdicts ?? []).length` -> `totaal: 0`    caught
//   4. `if (v?.strict)` -> `if (false)`                    caught
//   5. `else geenEnkeleRechter++` -> always geenEnkeleRechter++
//                                                           caught
// Items 6-8 of the matrix are the real SecondSwap/boundary cases already covered by name
// above (item 5: a-only match, item 6: a and b disagree on WHICH match, empty-string strict).
