# The scan on the EVMbench ruler, all 40 audits, 26 October 2026

One run of the production scan (version 3.1, unchanged) on the 40 audits of the public EVMbench detect set, with the two judges of every earlier run. Nothing was tuned on this set and no audit was run twice.

## The result

Known findings: 117 (the public configs of the benchmark list 117 high severity findings in these 40 audits; the paper says 120).

| Counted | First 15 hypotheses | First 30 hypotheses | The whole list |
|---|---|---|---|
| Strict, both judges name the same known finding | 23 of 117 (19.7 percent) | 29 of 117 (24.8 percent) | 29 of 117 (24.8 percent) |
| One judge is enough | not counted | 41 of 117 (35.0 percent) | 49 of 117 (41.9 percent) |

Precision, strict: 2.9 percent of the 1,537 hypotheses match a known finding. In 18 of the 40 audits the scan found nothing that both judges accept.

By group:

| Group | Audits | Known | Strict, first 15 | Strict, first 30 |
|---|---|---|---|---|
| All | 40 | 117 | 23 | 29 |
| Without the 4 audits that overlap our earlier tuning sets | 36 | 110 | 21 | 27 |
| The 7 newest audits (from February 2025, none used before) | 7 | 14 | 3 | 4 |
| The 29 older audits (2023 and 2024) | 29 | 96 | 18 | 23 |

The 4 overlapping audits are `2025-01-liquid-ron`, `2025-01-next-generation`, `2025-04-virtuals` and `2025-05-blackhole`. The 7 newest are `2025-02-thorwallet`, `2025-04-forte`, `2025-06-panoptic`, `2025-10-sequence` and the three `2026-01-tempo` audits.

## What this number is, and is not

- The ruler counts what you find. It does not count what you get wrong, so a long list of guesses can score high on it. We show the precision next to the recall for that reason.
- It is not the benchmark's own scoring. The benchmark asks, for each known finding, whether the whole report describes it. We ask, for each hypothesis, whether it matches one of the known findings, with two judges. The one judge row is the closest we can offer to their way of counting. It is not the same number.
- The older audits (2023 and 2024) are public and may be in the training data of the models behind the scan and the judges. The 7 newest are the cleanest, and also the smallest sample (14 findings).
- Only high severity findings are counted here. Our earlier results on Code4rena and Sherlock count High and Medium and are lower for that reason alone.
- 3 of the 3,074 judge answers could not be read and count as no match.

## The rules, and how verifiable this is

The rules for reading the result were written in a working note before the first scan. We anchored that note on Bitcoin only after the run, so the anchor proves the note existed by then and does not prove it came first. Treat the order as something you have to take on our word for this measurement. From now on we anchor the rules before the run.

## Recomputed by someone else

ruiruii ran check.mjs from a fetch of commit 07e6f90 on 26 October 2026 at 16:56 UTC, after reading the script and confirming that it reads local files only. The output matched this README: 40 audits, 117 known findings, strict 23 in the top 15, 29 in the top 30 and 29 in all, one judge 41 in the top 30 and 49 in all, and every audit matches the table (issue 41, comment 6422210780).

Asked and not yet answered: AgenticFinanceGraph and smartflowproai-lang. Anyone can add a line the same way, see issue 41.

## Time and cost

Scan: 2.79 dollars for the 40 audits (0.01 to 0.21 dollar each). Judges: 0.31 dollar for the final judging run.

## Files

- `evmbench-40.json`: one row per audit.
- `raw/`: the hypotheses of the scan per audit.
- `judge/`: the verdict of both judges for every hypothesis.
- `totals.json`: the sums above.
- `check.mjs`: recomputes every number in this file from `judge/`. Run `node check.mjs`.
