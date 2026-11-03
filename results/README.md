# Results of tokenizen

Cite as: tokenizen (github.com/holistis), results/ in holistis/bug-bounty-intelligence-mcp, and the folder name and date of the result you use.

Everything in these folders is open: the verdicts, the tables, the hashes and a script that recomputes the numbers. Anyone may recount, reuse or link it. If you use a number, please name where it came from and which folder, so the next reader can recount it too. If a number does not match when you recount it, say so in an issue and we will correct it and keep the old text visible (see ERRATA.md in the root of this repository).

The settings, prompts and models behind our scan are not published. What is published is what you need to check the result.

| Folder | What it holds |
|---|---|
| 2026-10-24-baseline | Baseline outputs of the pre-registered test, 0 of 31 |
| 2026-10-24-v2 | Results of the pre-registered measurement of version 2, 0 of 40, with the full tables |
| 2026-10-24-dev-set | Development set results, 24 October 2026 |
| 2026-10-24-dev-set-2 | Development set results, part 2, 24 October 2026 |
| 2026-10-24-sealed | Sealed set results, 24 October 2026 |
| 2026-10-25-c4-fresh | The scan on contests from the last year, 25 October 2026 |
| 2026-10-25-free-tools | Two free tools next to our scan, 25 October 2026 |
| 2026-10-25-v31 | Version 3.1 on the same eight contests, 25 October 2026 |
| 2026-10-26-evmbench | The scan on the EVMbench ruler, all 40 audits, 26 October 2026 |
| 2026-10-31-lab-sealed | Two runs of a development version on the sealed eight, 31 October 2026 |
| 2026-11-01-same-reports-different-judges | The same published reports under two other judges, 31 October and 1 November 2026 |
| 2026-11-02-independence-signals-afg-fixture | Concentration signals over a public file of payment-grounded feedback, 2 November 2026 |
| 2026-11-02-our-scan-under-the-benchmark-judge | Our research runs under a copy of the benchmark's own judge, 2 November 2026 |
| 2026-11-02-shop-setup-five-audits | The setup behind our deep scan on five audits, 14 of 20, 2 November 2026 |
| 2026-11-02-shop-setup-six-more-audits | The current setup on six more audits that earlier versions had run on, with precision and a repeat, 2 November 2026 |
| 2026-11-02-injected-bugs-test | Twelve faults inserted into three projects on the day, with clean controls, a script to rebuild the test and a script to re-judge with your own model, 2 November 2026 |

Most folders from 24 October to 1 November list their README file in their own hash list, so those README files are not edited after publication. This index covers them. Folders from 2 November on carry their own Cite as line.

## Voided open-judge answers in the older folders

In the open-judge runs a judge names the known finding it matches by its id. Our reading rule voids an answer whose id is not in the list or that cannot be read, and counts it as no match. Until 3 November 2026 the folders did not say how many answers were voided. Tom Smart found this in 2026-11-02-shop-setup-five-audits, and when we then went through every folder we found voided answers in the five older folders below. A voided answer can turn at most one hypothesis from not strict into strict, so a strict figure in such a folder could be higher by at most that many hypotheses. We publish these folders as they were and have not recounted them with the voided answers counted. Folders from 2 November on print the number in their own check.mjs and README.

| Folder | Voided answers | Unknown id | Unreadable |
|---|---|---|---|
| 2026-10-24-dev-set | 5 voided answers | 4 | 1 |
| 2026-10-24-dev-set-2 | 41 voided answers | 3 | 38 |
| 2026-10-25-v31 | 1 voided answer | 0 | 1 |
| 2026-10-26-evmbench | 3 voided answers | 3 | 0 |
| 2026-10-31-lab-sealed | 6 voided answers | 0 | 6 |

## Open checks

These checks are not done yet. If you do one, say so in issue 41. Your name goes into the README of the folder you checked, and your commits keep your authorship.

1. 2026-10-26-evmbench does not hold the ids of the 117 known findings, so its check.mjs cannot reject an id that does not exist. We found this by planting a made-up id in a copy of every folder, a test that Darja Rihla showed us in PR 74. The ids are in the benchmark source (openai/frontier-evals, commit b78dab1, each audit lists its findings). The counts per audit match (117 of 117). The titles and texts have not been compared, and we cloned that commit on 30 October, four days after the run.
2. The five older folders with voided answers (table above): recount their figures with the voided answers counted, and report the range.
3. A sample of the judges' verdicts read by a person: do they name the right finding? So far only the counting has been checked, not the judging.
