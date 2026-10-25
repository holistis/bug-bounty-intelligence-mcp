# Two free tools next to our scan, 25 October 2026

Question: how many of the known High and Medium findings of audit contests do two free, widely used static analysis tools find, with the same judges and the same rules as our scan? We ran Slither 0.11.6 and Aderyn 0.6.8 with their default settings on the same Code4rena contests and had the two judges of our other measurements compare the output with the known findings of the public final reports. The plan, with its hash, was written before the judges saw anything: [PREREGISTRATION-free-tools.md](PREREGISTRATION-free-tools.md) (in Dutch, byte for byte as written, sha256 27cca3b1bfc1688f85d491a3e0851da6f4464c71fb99bc170e1defd40abdf6d3).

## The result

Strict means both judges, from different model families, named the same known finding for the same root cause.

| Tool and set | Contests where it ran | Known findings there | Strict hits | Hypotheses | Our scan on the same contests (first 15 / whole list) |
|---|---|---|---|---|---|
| Slither, newer contests | 4 of 9 | 15 | 0 | 107 | 3 / 3 |
| Slither, older contests | 4 of 6 | 19 | 0 | 60 | 3 / 6 |
| Aderyn, newer contests | 4 of 9 | 15 | 0 | 81 | 3 / 3 |
| Aderyn, older contests | 6 of 6 | 55 | 0 | 121 | 7 / 11 |

Together Slither found 0 of 34 and Aderyn 0 of 70. Our scan found 6 of 34 and 10 of 70 in its first 15 hypotheses, and 9 of 34 and 14 of 70 in the whole list. For Slither, two hypotheses on one newer contest (sukukfi) were matched to a known finding by one judge only, which is not a strict match.

The newer contests are the cleaner comparison, because our scan was not built on them: 3 of 15 against 0 of 15 for each tool. The older contests (January to August 2025) may be in the training data of the model behind our scan, which the tools do not have, so read that part with care.

## What this does and does not say

- Static tools are not built to find the business-logic flaws that audit contests reward. They are free, fast and find other things (patterns, style, missing checks). A result of zero here says they do not overlap with the known High and Medium findings of these contests, not that the tools are useless.
- The known list only holds High and Medium findings that were accepted. A hypothesis from a tool can be a valid Low or Informational remark that is not on the list; it does not count as a hit here.
- Default settings, no tuning. Slither with Low, Informational and Optimization results left out, Aderyn with High and Low results. At most 40 hypotheses per contest and findings in lib, node_modules, test, mock, script and interface folders left out; the cap was never reached (the most was 36).
- The tools ran only where our setup could run them. Slither ran on 8 of 15 contests and Aderyn on 10 of 15. The failures are limits of our setup, not of the tools, and are listed with their reasons in [not-run.json](not-run.json). A user with a working project setup would get results on more contests.
- The judges are language models and this is our own measurement, not an independent one. The numbers are small.

## Files

- `res-Slither-newer.json`, `res-Slither-older.json`, `res-Aderyn-newer.json`, `res-Aderyn-older.json`: every judgement of both judges, per hypothesis.
- `judge-*.log`: the logs of the judging.
- `hypotheses/`: the output of each tool turned into hypotheses, per contest, as the judges saw it.
- `not-run.json`: the contests where a tool did not run, with the reason.
- `PREREGISTRATION-free-tools.md`: the plan.
- `SHA256SUMS`: the hashes of the files above.

How the tools were run: `slither . --json out.json --exclude-informational --exclude-optimization --exclude-low` and `aderyn . -o out.json`, from the project folder, after the project had been built with Foundry.
