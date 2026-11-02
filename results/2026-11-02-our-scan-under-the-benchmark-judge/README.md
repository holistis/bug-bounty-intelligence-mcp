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

In the file names, ag12 is one run of one agent, ag15 merges two runs and ag16 merges six runs. Only ag12 was judged as a single run: the single runs inside the unions were not judged one by one, so one run alone can be a more favourable or a less favourable pick than the one shown here.

Per audit: table.json. Per finding and per source: verdicts/, one file each, with the judge's reasoning.

## What this does and does not say

- It is not the scan we sell today. The scan in the shop is a cheaper and simpler route than these research runs, and the measurement of an earlier version of it is in the next section.
- A union takes everything found by any of the runs. A longer list helps a count that only measures recall. Over these 7 audits the six-run union has 270 entries and one run 70 (check.mjs counts them in reports/), the leader's report 174 (counted by us from their file, see table.json).
- Under this judge the leader is ahead of us, by one finding on the six-run union and by three on a single run. The benchmark's own grader counted the leader at 26 of 31 on these audits (see table.json, notes.leaderOwnGrader), so under their grader the gap to the union may be two.
- Audit 2024-04-noya is left out. It holds 20 of the 51 known findings in the audits where we ran our agents, and it is the audit where we lose most. Judging it for every source costs about 20 large calls per source and we have not done it yet.
- We picked the 7 audits because they were affordable, and 2024-01-renft was one of our development audits.
- One run per source. A difference of one or two findings is noise, the judge itself does not answer the same every time.
- Our judge ran through OpenRouter, so it can behave differently from the grader at the time the leader's run was graded. Whether the leader's run used the default grader settings is read from their command, not measured.
- The reports in reports/ were regenerated from our saved hypothesis files with the same function that built the text for the judge. The leader's report is in their own repository (see table.json, notes.leaderReportEntries.repository); only its verdicts are here.
- Prompts, models and settings of our agents are not published. Outputs, judge and counting are.

## An earlier version of the shop scan, on 5 of these audits

Correction on 2 November 2026. This section first said it measured the scan sold in the shop. It did not: the measurement was made on 1 November 2026 with an earlier, simpler route (one run per audit through a paid API, with a cost cap), and the shop's current setup, which reads a repository in parts and makes a second round, was built after it. The shop's current setup has not been measured on these audits yet. The text as it first read is kept below.

What the earlier route found, on 5 of the 7 audits (20 known findings): 8 of 20 (40.0 percent). The run on 2025-04-forte was stopped by our cost cap before it delivered a report, and its 5 findings are counted as zero. On the 4 audits where the runs finished it found 8 of 15 (53.3 percent). On the same 5 audits the leader's report finds 15 of 20 and one of our research runs 14 of 20. Per audit and the sums: table.json, totals.shopRoute (the key keeps its old name). In the file names or2 is secondswap, or3 size, or5 phi and or6 nextgen.

Five audits and one run each: one finding moves the share by five points.

First text, kept: "The deep scan in the shop runs a cheaper route than the research runs: one run per audit through a paid API, with a cost cap. We judged it on 1 November 2026, with the settings of the shop at that time, on 5 of the 7 audits (20 known findings). It found 8 of 20 (40.0 percent). The shop has changed since this measurement and has not been judged again."

## Recomputed by someone else

Tom Smart (smartflowproai-lang), outside our team, recounted this folder on 2 November 2026 and wrote his result in issue 41. Fresh clone at commit 363819e, Node 24: 7 audits, 31 known findings, 139 verdict files, 0 unreadable, azimuth-raw 25, ag12 22, ag15 23, ag16 24, and "all counts and hashes match". A separate recount in Python, written after reading check.mjs, reproduces the rows and totals of table.json and all 166 hashes in SHA256SUMS. Three checks that check.mjs does not make also pass: each of the four sources has a verdict on all 31 findings, no finding is detected for ag12 but not for ag15, or for ag15 but not for ag16, and no shop verdict file exists for forte, whose 5 findings are counted as zero. From the leader's own repository he also reports that RESULTS.tsv gives 26 of 31 on these 7 audits and that the 7 audit.md files have 174 headings starting with ##.

What this covers: the arithmetic and the consistency of the files. It does not cover whether the judge's verdicts are right, and nobody has checked the 31 against the benchmark's own configs yet. Anyone can add a line the same way, see issue 41.

## Check it

    node check.mjs

It recomputes every count in table.json from the verdict files and checks the hashes in SHA256SUMS. No network and no key needed.

Cite as: tokenizen (github.com/holistis), results/2026-11-02-our-scan-under-the-benchmark-judge in holistis/bug-bounty-intelligence-mcp, 2 November 2026.
