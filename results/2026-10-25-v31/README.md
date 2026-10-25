# Version 3.1 on the same eight contests, 25 October 2026

A second run of the scan on the 8 Sherlock contests of the sealed run ([../2026-10-24-sealed/README.md](../2026-10-24-sealed/README.md)), 105 known High and Medium findings, with a newer version called V3.1. This is not a sealed run. The contests and their results were published on 24 October, so they are no longer secret, and the models may have seen them. Read the numbers with that in mind.

## The result

| System | Found (strict) | Found (one judge) | Hypotheses | Precision (strict) |
|---|---|---|---|---|
| S0, the scan in production until 25 October | 1 of 105 (1.0 percent) | 1 | 43 | 4.7 percent |
| V3, the first run of the next version | 4 of 105 (3.8 percent) | 6 | 120 | 5.0 percent |
| V3.1, live since the evening of 25 October | 8 of 105 (7.6 percent) | 9 | 120 | 7.5 percent |

Strict means both judges, from different model families, named the same known finding for the same root cause. The judges and the scoring are the ones of the sealed run, unchanged ([../../bench/judge.mjs](../../bench/judge.mjs)). The judges agreed on 98 percent of the hypotheses.

By difficulty (easy is found by 5 or more wardens, middle by 3 or 4, hard by 1 or 2): V3.1 found 6 of 59 easy, 1 of 14 middle and 1 of 32 hard. V3 found 2, 0 and 2.

Per contest: 2025-03-symm-io-stacking 3 of 6, 2025-05-dodo-cross-chain-dex 2 of 17, 2025-05-yearn-ybold 1 of 3, 2025-04-aegis-op-grant 1 of 3, 2025-07-mellow-flexible-vaults 1 of 15, and 0 in 2025-06-notional-exponent (37 known), 2025-01-perennial-v2-4-update (7) and 2025-07-malda (17).

Time and cost: about 20 to 50 seconds and 0.02 to 0.15 dollar per scan, 0.50 dollar for all eight. The judges cost 0.04 dollar.

## What is the same and what changed

3 of the 8 findings were also found by V3. 5 are new, and V3 found one that V3.1 did not (2025-07-malda M-1). Three of the five new ones are in one small contest, symm-io-stacking.

Two things changed at once, so this run cannot say which one did the work: a newer model, and a fix of the scope (code in `lib/` and in nested dependencies no longer counts as the project's own code). The settings, the prompts and the model are not published, as before. The files and the results below are what anyone can check.

## The rule, and how verifiable this is

Before the run we wrote down, in our working notes, how we would read the result: 8 or more of 105 is a clear gain, 5 to 7 modest, 4 or fewer none. Those notes are not public and carry no hash, so this run is less verifiable than the pre-registered one. The result is exactly at the line: 8.

## What this does and does not say

- It is a doubling on the same contests, from a low level. 97 of 105 known findings were still not found, including 53 of the 59 easy ones. Nobody should read this as a scan that finds what a human audit finds.
- One run per contest, small numbers. A repeat could plausibly give anything from about 6 to 10.
- 2025 contests may be in the training data of the models, so absolute numbers can be too high.
- The judges are language models. This is our own measurement, not an independent one.
- On the six development contests, which we did tune on, an uncapped run of the new version found 13 to 14 of 85 known findings against 5 to 7 for the old one, in three runs. That points the same way, and it is the data this version was chosen on.

## What is live

Paid scans run on V3.1 since the evening of 25 October. The earlier version stays in place as the fallback if the new one fails, and it keeps running the hourly delivery check of our own service. The report says how much of the code was read; V3.1 reads up to about 450 KB of the most relevant code, so on a large repository it reads only part, and the report states the percentage.

## Files

- `res-V31cap.json`: every judgement of both judges, per hypothesis.
- `judge-V31cap.log`: the log of the judging.
- `raw/`: the 15 hypotheses per contest as the scan produced them, without settings or per-call records.
- `sample-report-symm-io-stacking.html`: a real report as the paid flow delivers it, made by the production pipeline on the public repository of one of these contests (a test job with the payment check skipped, so nobody paid for it). Its sha256 is a4ca62cd2737eccf0aa3f447d6320ee429fb989f7cc3fc7af7d6b2e0898c9d5f, the same hash the service recorded when it delivered it.
- `SHA256SUMS`: the hashes of the files above.
