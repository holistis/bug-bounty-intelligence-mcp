# The Publication Rule for Scan Results

Version 1, 30 October 2026. By Abdellah Ouadoudi (github.com/holistis).

A rule for what we publish about our own measurements of the scan, and how fast. It exists so that you see every run, the bad ones included, and not only the runs we would have picked. The number of a run is counted under the [Two-Judge Strict Rule](MEASUREMENT-RULE-two-judge-strict.md).

## The rule

1. Fixed sets. There are three: the sealed set (8 contests, 105 known findings, committed by hash on 24 October 2026), the nine newer Code4rena contests (66 known findings), and the 40 audits of the public EVMbench detect set (117 high severity findings). A contest is never taken out of a set. A new set is announced on the scoreboard before its first run.
2. A run. When we run a version of the scan on every contest of a fixed set and read the result, that is a run. It does not matter whether we mean to put that version into production. A run that went partly wrong (a job that failed, an empty report) is still a run and is published with the failure.
3. Publication. Within 7 days after a run ends, it is a row on the scoreboard (tokenizen.nl/scoreboard) with a link to a results file in this repository. The row gives the date, the version, the strict number, the number of hypotheses, and every caveat we know of. The raw outputs and both judges' verdicts are in the results file.
4. Lower numbers. A run with a low number is published exactly like one with a high number. If a version scores a lower strict number than the run just before it on the same set, the row says so and shows both numbers side by side, within the same 7 days. When a row rests on one run, it says "one run": a repeat can land elsewhere, and we do not wait for a repeat before publishing.
5. Not covered. Trials on the development set, the set we tune on, are not covered by this rule. When we show one, it is labelled as not evidence. The rule says nothing about what the scan finds in your code, only about our own measurements.

## Starting from when

The rule applies to every run that ends on or after 30 October 2026.

## What the rule does not do

It does not judge the scan. It makes sure you can see all of our measurements and judge for yourself. It cannot show a run we never did, so it says nothing about what we chose not to try. The OpenTimestamps stamp next to this file shows that this text existed no later than the date of that stamp, once the stamp is confirmed.
