# Pre-registration of the next measurement, 26 October 2026

Written on 26 October 2026, before any scan of this measurement exists. The file is time-stamped on Bitcoin with OpenTimestamps before it is committed: the proof is `PREREGISTRATION-next-run-2026-10-26.md.ots` next to it. The counting rule is in `MEASUREMENT-RULE-two-judge-strict.md`, with its own proof file.

## What is measured

Scan version 3.1, the one in production. If a candidate version exists when the run starts, the candidate is measured too, on the same contests.

## On which contests

The first 8 Code4rena contests whose final report is published after 1 November 2026, in the order of publication on the Code4rena reports page. A contest is skipped only if it has no public source code or if its report lists no High or Medium finding. Nobody picks the contests. The order of publication does. None of them can be in a set the scan was tuned on.

## How it is counted

The Two-Judge Strict Rule, version 1. High and Medium findings of the final report. First 15 and first 30 hypotheses. Judges: gpt-oss-120b and deepseek-v4-flash. If a judge model is no longer available, we say so and name its replacement before we read any verdict.

## The bar

A candidate replaces 3.1 only if both of these hold on these eight contests:

- its strict hits in the first 30 hypotheses are more than the strict hits of 3.1,
- its precision under the rule is not lower than the precision of 3.1.

If there is no candidate, 3.1 alone is measured and the result is published as its number on contests it could not have been tuned on.

## Publication

Everything is published in `results/` of this repository: raw hypotheses, both verdicts, the script, the misses. The run starts when eight eligible reports exist, and the result is published within 14 days of the run, whatever it is. We cannot promise a calendar date, because it depends on when contests publish their reports. If the run is delayed, we say so here instead of letting it lapse.

## What counts as failing this pre-registration

- The result is not published.
- The contests, the judges, the severities or the bar are changed after the run has started, other than the judge replacement described above.
- Something is counted that the rule does not allow.

## Limits

Eight contests are a small sample. Each contest is run once. Both judges are language models.
