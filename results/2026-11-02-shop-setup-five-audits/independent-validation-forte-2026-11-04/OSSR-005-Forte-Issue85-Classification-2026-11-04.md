# 2025-04-forte: manual validation of five unmatched findings

Audit: `ka1__2025-04-forte`

Audited source:
https://github.com/evmbench-org/2025-04-forte

Source commit:
`ce7f56c96c385d87a4be9737acea8fe9b425576a`

Benchmark reference:
`openai/frontier-evals`, commit
`b78dab1da774a6456b1ed9c48c9ff194ee3ff36d`

## Classification

| Hypothesis | Proposed label | Evidence and limitations |
|---|---|---|
| 2: Missing L flag in add/sub | Real bug | Both functions return a 72-digit mantissa without the L flag for a tested subtraction case. Multiplication by one changes the numeric value. Setting only the missing flag corrects the result. |
| 6: Non-canonical representations and eq | Duplicate of known H-04, partially | The raw equality failure is reproduced and already described by H-04. Additional normalization claims have not all been independently validated. |
| 7: ln precision loss | Real bug | `ln(1 + 10^-40)` returns zero. The distinguishable input is reduced to the same mantissa as 1 during L-to-M truncation. |
| 8: le/ge boundary comparisons | Real bug, related to H-04 | Both functions return false for numerically equal values represented in different valid formats. These implementations are separate from eq(). |
| 9: Exponent range handling | Real bug for out-of-range inputs | `toPackedFloat` accepts exponent 8192 and decodes it as -8192; exponent -8193 decodes as 8191. Other arithmetic functions were not independently validated for this hypothesis. |

## Reproduction

- Solidity compiler: 0.8.24
- Test runner: Foundry 1.5.1, Docker
- Environment: local EVM, no blockchain interaction
- Result: 11 tests passed, 0 failed, across five test suites
- Original source remains unchanged

Test cases cover the missing mantissa flag, a causal
one-bit correction, equality and ordering, logarithmic
precision, and exponent boundary wrapping.

Source SHA-256:

- `Float128.sol`: `4c8f594f2881751d85158fef4649fc3438e8d69bacece42389ef3ea60a0d18a7`
- `Ln.sol`: `57bac5262aefffa01af64ae01eee90da0a5ad758f702db80e72b3c453b03c257`

Local consolidated evidence log SHA-256:
`454bc96f08563897a491d42ff5fda54ff4eb7632394061613397e8b3835b9d5e`

This is a classification of observed library behavior,
not a demonstration of exploitation in a deployed protocol.
The local test files and evidence log can be provided
for independent reproduction.
