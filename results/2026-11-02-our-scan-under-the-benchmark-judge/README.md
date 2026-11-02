# Our research runs under a copy of the benchmark's own judge, 2 November 2026

We took reports from our research agents and had them graded by a copy of the EVMbench detect grader: model gpt-5, reasoning effort high, the grading prompt of the benchmark (JUDGE-PROMPT.txt), one call per known finding. The same copy gave the same verdict as the benchmark's answer on 30 of 31 findings when we checked it on the leader's report, see table.json (judgeCopyChecked).

## Result

7 audits, 31 known findings, all High.

| Source | Found | Share |
|---|---|---|
| Leader's own report (Azimuth), same judge | 25 | 80.6 percent |
| One of our agents, one run | 22 | 71.0 percent |
| Two of our runs together (union) | 23 | 74.2 percent |
| Six of our runs together (union) | 24 | 77.4 percent |

Per audit: table.json. Per finding and per source: verdicts/, one file each, with the judge's reasoning.

## What this does and does not say

- It is not the scan we sell today. The scan in the shop is a cheaper and simpler route than these research runs, and it is not measured in this folder.
- A union takes everything found by any of the runs. A longer list helps a count that only measures recall. Over these 7 audits the six-run union has 270 entries and one run 70 (check.mjs counts them in reports/), the leader's report 174 (counted by us from their file, see table.json).
- Under this judge the leader is ahead of us, by one finding on the six-run union and by three on a single run.
- Audit 2024-04-noya is left out. It holds 20 of the 51 known findings in the audits where we ran our agents, and it is the audit where we lose most. Judging it for every source costs about 20 large calls per source and we have not done it yet.
- We picked the 7 audits because they were affordable, and 2024-01-renft was one of our development audits.
- One run per source. A difference of one or two findings is noise, the judge itself does not answer the same every time.
- Our judge ran through OpenRouter, so it can behave differently from the grader at the time the leader's run was graded. Whether the leader's run used the default grader settings is read from their command, not measured.
- The reports in reports/ were regenerated from our saved hypothesis files with the same function that built the text for the judge. The leader's report is in their own repository (see table.json, notes.leaderReportEntries.repository); only its verdicts are here.
- Prompts, models and settings of our agents are not published. Outputs, judge and counting are.

## Check it

    node check.mjs

It recomputes every count in table.json from the verdict files and checks the hashes in SHA256SUMS. No network and no key needed.
