# The scan on contests from the last year, 25 October 2026

Question: does the result on the 8 Sherlock contests (8 of 105 known findings, [../2026-10-25-v31/README.md](../2026-10-25-v31/README.md)) hold on newer contests that were not used to build the scan? We ran the scan as it is in production once on 9 Code4rena contests from September 2025 to March 2026 and had the same two judges as before compare the results with the known High and Medium findings of the public final reports.

## The result

| | Known High and Medium | Found with the first 15 hypotheses | Found with the first 30 | Found in the whole list |
|---|---|---|---|---|
| 9 Code4rena contests | 66 | 5 (7.6 percent) | 8 (12.1 percent) | 8 (12.1 percent) |
| For comparison, 8 Sherlock contests | 105 | 8 (7.6 percent) | 11 (10.5 percent) | 17 (16.2 percent) |

Strict means both judges, from different model families, named the same known finding for the same root cause. The first 15 are what a report showed until today, in order of the model's own confidence. For Sherlock the first-15 number comes from a run that was capped at 15; the first-30 and whole-list numbers come from a separate run that returned all 581 hypotheses, whose own first 15 held 6. The judges agreed on 97 percent of the 356 hypotheses.

| Contest | Known | First 15 | First 30 | Whole list | Hypotheses | Code read |
|---|---|---|---|---|---|---|
| 2025-10-hybra-finance | 10 | 0 | 0 | 0 | 34 | 439 of 589 KB |
| 2025-10-sequence | 6 | 1 | 1 | 1 | 41 | 156 of 156 KB |
| 2025-11-brix-money | 3 | 0 | 2 | 2 | 43 | 159 of 159 KB |
| 2025-11-ekubo | 4 | 0 | 0 | 0 | 40 | 310 of 310 KB |
| 2025-11-megapot | 11 | 1 | 1 | 1 | 42 | 165 of 165 KB |
| 2025-11-merkl | 3 | 0 | 0 | 0 | 38 | 147 of 147 KB |
| 2025-11-sukukfi | 4 | 2 | 2 | 2 | 40 | 232 of 232 KB |
| 2026-01-olas | 23 | 1 | 2 | 2 | 37 | 439 of 1140 KB |
| 2026-03-intuition | 2 | 0 | 0 | 0 | 41 | 282 of 282 KB |

By difficulty, estimated from the number of wardens named under each finding in the report (5 or more easy, 3 or 4 middle, 1 or 2 hard): the first 15 found 3 of 35 easy, 0 of 8 middle and 2 of 23 hard. The whole list found 5, 1 and 2. A scan took 22 to 66 seconds and 0.06 to 0.13 dollar, 0.84 dollar for all nine. The judges cost 0.07 dollar.

## How we read it, and what it does and does not say

The rule for reading the result was written before the first scan ran, and its hash was noted in our working notes at that time: 5 percent or more of the known findings in the first 15 means the result holds on newer contests, 3 to 5 percent means weaker but not nothing, under 3 percent means the Sherlock result overstates the scan. The result is 7.6 percent, so it holds by that rule. The rule text is in [PREREGISTRATION-fresh-set.md](PREREGISTRATION-fresh-set.md). It was published after the run, so the order of events cannot be proven from this repository, only from the hash we recorded. One number in it is off: it says 8 candidate contests had no report yet, the exact count is 7 ([excluded-contests.json](excluded-contests.json)).

- It is a hit rate of about 8 in 100 known findings on the first 15. 58 of the 66 known findings were not in the first 15. This is not a scan that finds what a human audit finds.
- Small numbers, one run per contest. 5 of 66 and 8 of 105 are the same rate within what chance alone can do, so we do not claim the two sets differ or are equal.
- Code4rena reports list the findings that were kept after merging duplicates and removing low ones, so the known list is not the same kind of list as on Sherlock.
- The Olas contest is 1140 KB of Solidity and the scan reads at most about 450 KB, so it read 38 percent of it; Hybra read 75 percent. The report says so for every scan.
- Contests from early 2026 may be in the training data of a model. We do not know the cut-off dates.
- The judges are language models. This is our own measurement, not an independent one.
- Which contests are in the set was fixed by rule: repositories created since 15 August 2025 with a public final report, at least 2 known findings and at least 3 Solidity files in the scope of the scan. Of 24 candidates, 9 qualify. 7 have no public report yet, 5 are not Solidity or too small, 3 have fewer than 2 known findings. Contests that get a public report later can be measured as they appear, which is forward-looking: the scan has never seen those contests.

## The second list

Since this evening the scan can show up to 30 hypotheses in a report, in two lists: the 15 the model is most confident about, and 15 more with lower confidence. We decided this after looking at these numbers and the numbers of the Sherlock pool, not before, so it is a product choice and not a pre-registered test.

Replayed on the stored lists (no new run): on the Sherlock run that returned all 581 hypotheses the first 15 per contest held 6 known findings and the first 30 held 11; on these Code4rena contests 5 and 8. Together 11 and 19 of 171 known findings. The second list is a little less precise than the first: per hypothesis shown, about 4 in 100 of the first 15 matched a known finding (11 of 255), and about 3 in 100 of the next 15 (8 of 255). It added 8 findings that the first list did not hold. Reports say this in the heading of the second list. It is behind a switch and can be turned off.

## Files

- `res-C4v31.json`: every judgement of both judges, per hypothesis, in the order of the list.
- `judge-C4v31.log`: the log of the judging.
- `raw/`: the whole list per contest as the scan produced it, with confidence, without settings or per-call records.
- `known-findings.json`: per contest the known High and Medium findings (id, severity, title, approximate number of wardens, files) with a link to the public report and to the repository. The text of the reports is not copied.
- `excluded-contests.json`: the 15 candidates that did not qualify, with the reason.
- `PREREGISTRATION-fresh-set.md`: the plan and the rule, in Dutch as it was written, byte for byte.
- `SHA256SUMS`: the hashes of the files above.

The plan file hashes to 6ddedfa71de7c9c1b02fa572fac55b47f7091b3c68dc446215c7f77cc3546887. The settings, prompts and model of the scan are not published, as before.
