# Pre-registration: out-of-sample test of Bug Bounty Intelligence

Written on 24 October 2026, before any scan of these contests was run. The commit time of this file is the proof of that.

## Question

Does the paid scan, as it runs today, find High and Medium findings on audit contests it has not seen? We do not know. Our only earlier benchmark found no real bug on either side, so it cannot answer this.

## Selection rule (fixed before looking at any result)

All Code4rena contests whose source repository was created between November 2025 and April 2026, that have a published final report, that are Solidity, and that list at most 45 Solidity files in scope in their README. This is out of sample twice: the corpus behind the framework is Sherlock judging repositories from 2024-02 through 2025-07, and the models the runner calls for its main step (Llama 3.3 70B and gpt-oss-120b, depending on which source answers) were trained before these contests were published.

Contests that match: 2025-11-merkl, 2025-11-sukukfi, 2026-04-monetrix, 2026-01-olas. Excluded by the rule: 2026-03-intuition (123 files in scope), 2026-04-k2 (no file table in the README), 2026-02-jupiter-lend (not Solidity), and the contests without a published report.

## Ground truth

The High and Medium findings in the official reports, as published on 24 October 2026: 12 High and 19 Medium, 31 in total. SHA-256 of the canonical JSON of this list: `94b5889235eb4478b83258906470523b7a752521252131c56a799233d1753158`.

### 2025-11-merkl (report: https://code4rena.com/reports/2025-11-merkl)
- M-01: Minimum Reward-Per-Hour Validation Applied to Gross Instead of Net Amount
- M-02: Improper Error Handling of
- M-03: Multi-step campaign overrides are anchored to the original campaign, making later overrides impossible

### 2025-11-sukukfi (report: https://code4rena.com/reports/2025-11-sukukfi)
- H-01: Missing Authorization Check Allows Unauthorized Fund Withdrawal
- M-01: The unregistering of vaults can be DoSed by a malicious user.
- M-02: Stale Redemption Liabilities Lead to Leveraged Losses for Remaining Shareholders and Potential Denial of Service
- M-03: fulfillRedeem may corrupt share price and allow over-redemption of assets Low Risk and Informational Issues 01 Vault approval is not revoke

### 2026-04-monetrix (report: https://code4rena.com/reports/2026-04-monetrix)
- M-01: PM borrow liabilities are omitted from backing, allowing phantom surplus settlement

### 2026-01-olas (report: https://code4rena.com/reports/2026-01-olas)
- H-01: Broken TWAP validation allows spot-price manipulation and renders slippage checks ineffective
- H-02: Variable Overwrite in
- H-03: Balancer oracle uses vault balances as price and can be steered by anyone
- H-04: Incorrect TWAP calculation in BalancerPriceOracle allows price manipulation and breaks oracle guarantees
- H-05: Insolvency via Cross-Service Reentrancy in StakingBase._withdraw
- H-06: Service owner can steal protocol tokens by exploiting reentrancy in create
- H-07: Missing deadline parameter in register signatures
- H-08: Critical Logic Inversion in Price Guard Allows Flash-Loan Manipulation of Liquidity Operations
- H-09: Missing maximum bond signature parameter
- H-10: Token Callback Reentrancy
- H-11: cumulativePrice is corrupted when price updates are rejected Medium Risk Findings (12) [M-01] Arbitrum Retryable-Ticket Refund/Value Not Ve
- M-01: Arbitrum Retryable-Ticket Refund/Value Not Verified Enables Timelock ETH Exfiltration
- M-02: Uniswap oracle validateprice can be griefed per block via
- M-03: Price cumulative last is used inverted in Uniswap Oracle
- M-04: DoS in Liquidity Migration due to Unit Mismatch in UniswapPriceOracle
- M-05: BalancerPriceOracle::validatePrice uses stale TWAP [M-06] changeRanges silently fails when price is out of tick range, sending all liquidit
- M-06: changeRanges silently fails when price is out of tick range, sending all liquidity to treasury instead of creating new position
- M-07: Malicious user can prevent buying back OLAS token via Slipstream
- M-08: Incorrect proportional reward splits when an operator has been slashed
- M-09: checkpoint() does not correct effectiveBond downward at year boundaries where inflation decreases [M-10] Services can earn undeserved rewar
- M-10: Services can earn undeserved rewards by manipulating checkpoint timing during reward droughts
- M-11: No slippage protection on Uniswap swap
- M-12: Balancer oracle deadlock from cumulative price weight

## What is run

The production job runner as deployed on 24 October 2026 (scripts/bug-intel-runner.mjs, SHA-256 `4ef446481e222f8eaf4c8b9e21f6ece9999152b31fecf724b5e112d9fdc6d9e2`), with its default settings, on each repository exactly as it is cloned. No files are picked by hand and no prompt is changed for these contests. Each contest is run once.

## How a result is scored

- A reported hypothesis is a hit if it names the same contract or function and the same root cause as one of the findings above. We decide this by reading both. The full table of hypotheses, matches and non-matches is published, so anyone can redo the matching.
- Recall: hits divided by 31, and per severity.
- Hit rate: matching hypotheses divided by hypotheses reported. A hypothesis that matches nothing is not proven false, so we do not call it a false positive.
- Coverage: the share of Solidity source characters that reached the model. Measured before the run on three of the four repositories: 3 to 7 percent.
- Recall among the findings that sit in files that reached the model.

## Prediction, written before the run

At most 2 of the 31 findings are found. The runner sends the model at most about 22,000 characters per job and does not skip test or mock folders, so most files are never read. For 2026-01-olas we expect the file collection to find no Solidity files at all, which would be a defect in itself.

## Decision rules

- No hit at all: we stop describing the paid scan as something that finds bugs on projects it has not seen, and we publish this result.
- One or more hits: we report "n of 31 on four contests" and do not extrapolate.
- Any change to the pipeline (file selection, chunking, a stronger model) is a new pre-registered version. It is measured on the same four contests and on contests that publish their reports after today, and the numbers of every version are published.
- If we tune on these four contests, they stop being out of sample and we say so.

## Limits

Four small contests. Contest judging is a human process and has its own misses. We do the matching, and we are an interested party, which is why the table is public. This is our own measurement, not an independent one.
