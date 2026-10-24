# Pre-registration v2: the changed scan, measured again

Written on 24 October 2026, before any scan with the changed pipeline was run on the contests below. The commit time of this file is the proof of that. The first measurement is in [RESULTS-2026-10-24.md](RESULTS-2026-10-24.md): 0 of 31 known High and Medium findings on four contests, with 3 to 7 percent of the code read.

## What changed in the pipeline, and why

Each change answers a defect that the first measurement or a review of the code showed.

1. Submodules. Repositories that keep their code in git submodules failed without a report, because the clone never fetched them. The scan now fetches submodules that point to https://github.com, skips dependencies (a lib folder, node_modules, vendored libraries) and anything with an unsafe address or path, and says what it did in the report.
2. Scope. Tests, mocks, scripts, interfaces and vendored libraries are no longer read. Before, they filled the part of the code that reached the model.
3. Reading order and parts. Files are ranked by how likely they move funds (external calls, transfers, oracles, deposit and withdraw style functions, names like vault or pool). They are sent in at most six parts of about 20,000 characters, where the old scan sent one part of 22,000 characters taken in folder order. A file larger than a part is cut at line boundaries.
4. Coverage in the report. Every report states how many bytes of in-scope Solidity the model actually read, which files were read in full, partly or not at all, and what was left out and why.
5. No silent empty report. A scan that ends with no hypotheses gets one second try on the two highest-ranked parts with a different strong source, and is then delivered as "no hypotheses came out of the x percent that was read", not as a normal finished report. The terms now offer a new attempt or a refund in that case.
6. Hypotheses must point at real code. A hypothesis that names a file or function that is not in the part the model was shown is dropped, and the number dropped is in the report.
7. Only strong sources. If no strong model source answers for a part, that part counts as not read. The scan never falls back to a small local model for paid work.
8. Symlinks. The old file collection followed symlinks. A repository could contain a file named x.sol that is a link to a file on the server, and the content of that file would have gone to the model. Measured with a decoy file before this change: the old collection read it, the new one does not. Symlinks are never read now. This does not change what the scan finds, it is listed because it is a change to the code that runs.

The prompt of the hunt itself is the same as before, with these additions: the part number, the names of the other in-scope files, an instruction to name only files and functions that appear in the code shown, and an instruction to output nothing when nothing meets the rules.

## Frozen files

These are the files that run in production after the change. The measurement uses a copy of the runner that differs only in the delivery step: it writes the report to a local folder instead of posting it to the live server (diff in [pipeline/v2/DIFF-production-vs-test-copy.txt](pipeline/v2/DIFF-production-vs-test-copy.txt)).

- bug-intel-runner.mjs (production) SHA-256 `346f38899db1e6297f8d6d62827dcc0baf8ebdf46dd10c0f2ea1d88fa2280851`
- bug-intel-runner.mjs (test copy) SHA-256 `5255c3a9aa4cfd72bd50d1466a01dc0de1d38936013359d42898fccb2768b5fa`
- bug-intel-scope.mjs SHA-256 `546457ef359b07a315e2cecc8f020948be6f26a9b6137f9de4afb0202654e366`

The source is in [pipeline/v2](pipeline/v2). The previous version, which the first measurement used, has SHA-256 `3959b37ab528a6d7ede540111e5aa2a7967c75993d79e01849c28f8a25d21c65`.

## Which contests

Set A, the four contests of the first measurement: 2025-11-merkl, 2025-11-sukukfi, 2026-04-monetrix, 2026-01-olas. 31 known findings (12 High, 19 Medium), listed with their hash in the first pre-registration. These four are no longer unseen for the design of the pipeline: the defects above were found by running on them, and 2026-01-olas is the repository where the old scan found no Solidity at all. Results on set A are reported as "tuned on", not as out of sample.

Set B, three contests that were not scanned and not used for the design. Selection rule, fixed before looking at any result: all Code4rena contests whose repository was created between 1 November 2025 and 30 April 2026, that are not mitigation reviews, not in set A, that have a published report on code4rena.com with at least one High or Medium finding, and that have in-scope Solidity according to the free precheck of the scan itself. Contests that match: 2025-11-brix-money, 2025-11-ekubo, 2026-03-intuition. Not matching, with the reason: 2025-12-panoptic, 2026-02-injective, 2026-03-chainlink and 2025-11-sequence have no published report yet; 2025-11-swafe, 2025-12-rujira, 2026-04-k2 and 2026-02-jupiter-lend have no Solidity in scope; the mitigation reviews are a different task. The rule has no size limit on purpose, so large contests with low coverage are included.

Ground truth for set B, the Medium findings of the official reports as published on 24 October 2026 (no High findings were published for these three): 9 in total. SHA-256 of the canonical JSON of this list: `ff6b0d41df85af0eea42c50e54b5bce1960dd11bdeb2747b081fa15b3288185d`.

2025-11-brix-money (https://code4rena.com/reports/2025-11-brix-money)
- M-01: User can bypass staking restrictions through composer and deposit on another chain
- M-02: Cross-chain unstake and fast redeem operations fail due to minAmountLD not accounting for LayerZero dust removal
- M-03: Incompatibility with Account Abstraction and Multisigs due to enforced address symmetry in cross chain unstaking

2025-11-ekubo (https://code4rena.com/reports/2025-11-ekubo)
- M-01: Oracle Data Corruption via Storage Key Collision
- M-02: TWAMM Instant Orders Can Steal Historical Rewards
- M-03: Wrong rounding direction in DurationRemaining leads to value loss from TWAMM extension and Temporarily Freezing
- M-04: Router does not check if Exact Out Single Swap was partial leading to unexpected results for the users

2026-03-intuition (https://code4rena.com/reports/2026-03-intuition)
- M-01: Unsigned validity window metadata
- M-02: Epoch-boundary checkpoints retroactively qualify for the previous epoch's rewards

The count per contest matches the "Medium Risk Findings (n)" line of each report: 3, 4 and 2.

## What is run

The test copy of the runner above, with its default settings (at most six parts, 20,000 characters each, a 30 minute budget per job), on each of the seven repositories exactly as they are cloned. One run per contest, one after the other, on the same server that runs the paid scan. No file is picked by hand and no prompt is changed for these contests. The model source that answered each part is recorded. The free precheck is run on each repository first, and its estimate of the coverage is recorded before the scan starts.

If a run stops because of a defect in the runner code itself (not because a model source was unavailable), the defect is fixed, the fix is listed here as an amendment, and the contest is run again. The first attempt is still reported. If a run fails because no strong source was available, that is reported as a failed job and the contest is run again once, with both outcomes reported.

## How a result is scored

The same way as the first measurement. A reported hypothesis is a hit if it names the same contract or function and the same root cause as one of the known findings. We decide this by reading both, and the full table of hypotheses, matches and non-matches is published so anyone can redo the matching.

- Recall: hits divided by the known findings, for set A (31) and set B (9) separately.
- Hit rate: matching hypotheses divided by hypotheses reported. A hypothesis that matches nothing is not proven false, so we do not call it a false positive.
- Coverage: read bytes divided by in-scope bytes, as stated in each report, next to the estimate of the precheck.
- Recall among the known findings whose affected file was read. The affected files are taken from the text of each official finding, by hand.
- Operations: how many of the seven jobs ended with a report, how long each took, which sources answered, how many hypotheses were dropped for naming code that is not there.

## Prediction, written before the run

- At least six of the seven jobs end with a delivered report. The model sources are free tiers and several are known to be down or rate limited, so one failed job would not surprise us.
- The coverage in each report is within 15 percentage points of the precheck estimate: merkl 77, sukukfi 50, monetrix 100, brix-money 73, ekubo 28, intuition 44. For olas the main repository has no in-scope Solidity and the estimate cannot be given; we expect the three submodules to be fetched and Solidity to be found, which is the defect of the first run no longer happening.
- Total hits are at most 4 of the 40 known findings, most likely 1 or 2. Hit rate below 10 percent.
- At most one job ends as "no hypotheses".
- At least one job drops a hypothesis for naming code that does not exist.

## Decision rules

- No hit at all across the seven contests: we publish "0 of 40 with most of the in-scope code read" next to the 0 of 31 of the first measurement, we describe the paid scan only as a generator of hypotheses to review by hand, and we put the question of the price and of the offer to the owner.
- One or more hits: we publish "n of 31 on set A, tuned on" and "n of 9 on set B" separately, and do not extrapolate from either.
- Whatever the result, the numbers, the misses and the table are published.
- No change to the pipeline between this file and the publication of the results. A later change is a new pre-registered version.
- Contests whose reports are published after today are a third set. They will be added, with this same method, as they appear, and reported as set C.

## Limits

Seven small contests, nine known findings in the held-out set. Contest judging is a human process and has its own misses. We do the matching and we are an interested party, which is why the table is public. The model sources are free tiers, so the same repository can give a different answer on another day; each contest is run once. We cannot state the training cutoff of every model source, so a model may have seen material about a contest. This is our own measurement, not an independent one.
