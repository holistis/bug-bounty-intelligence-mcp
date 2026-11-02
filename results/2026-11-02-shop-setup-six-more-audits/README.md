# The current setup of our cyber security scan on six more audits, 2 November 2026

The first measurement of the current setup (results/2026-11-02-shop-setup-five-audits) covered five audits. This folder adds six more with the same setup: four small ones, three of them from January 2026, and two larger ones. Same scan code, model and thinking limit as the shop. One run per audit, from a script on our own machine. The cost limit per audit was the one the shop computes for a repository of that size.

## Where these audits come from

They are not fresh. Earlier versions of our scan ran on all six, and our own notes of 30 October set the four small ones aside for tuning the scan's reliability. The four small audits (2026-01-tempo-feeamm, 2026-01-tempo-stablecoin-dex, 2026-01-tempo-mpp-streams and 2025-02-thorwallet) are in the 40-audit run of 26 October (results/2026-10-26-evmbench). The two larger audits (2025-03-symm-io-stacking and 2025-05-yearn-ybold) are two of the eight contests of the sealed set (results/2026-10-24-sealed). Earlier versions ran on them in results/2026-10-25-v31, which publishes a sample report for 2025-03-symm-io-stacking, and in results/2026-10-31-lab-sealed.

Our note before these runs called these audits unused. That was wrong, and we corrected it before publishing. We have not separated which of them the current setup was tuned on. So this folder does not show that the setup works on contracts it was not built on, and it is not a result on new contracts. It shows the current setup on six more audits, with its precision and a repeat. Whether the model behind the scan saw these contracts we do not know, and January 2026 may well lie inside its training window.

## The judges

The four small audits are in the EVMbench set, so the same copy of its detect grader as before could judge them (gpt-5, high reasoning effort, JUDGE-PROMPT.txt, one call per known finding). The two larger audits are not in the EVMbench set, and we had no benchmark description of their findings in the form the grader copy reads. Their known findings come from our copy of the sealed set and include Medium severity (known/ lists them). For all six audits the two open judges (gpt-oss-120b and deepseek-v4-flash) named, per hypothesis, the known finding it matches, with the prompt in OPEN-JUDGES-PROMPT.txt. Strict means both name the same one. They agreed on every hypothesis here. In the first measurement they found 9 of 20 known findings strictly where the grader copy found 14 (results/2026-11-02-shop-setup-five-audits). They are language models.

## The rule, and two readings of it

We wrote the rule down in a local note that nobody else can see, so you cannot check when. The order was this. The first rule, for the four small audits with the grader copy, was written before any scan started: it holds at 3 of 5 found and at least 20 percent of the first five hypotheses per audit matching. The second rule, over all audits together, was added after the scans of the small audits had run and before any judging, and before the larger audits and the repeat ran: it holds at at least 40 percent found and at least 15 percent in the first five, and it does not hold below 25 percent found or below 10 percent in the first five. The note named the grader copy only for the four small audits, and the second rule named no judge. The grader copy could not judge the larger audits, so we applied the second rule with the open judges. That choice was made after the runs, when the open judges' numbers for the larger audits were already in our log. We give both readings.

- First rule, four small audits: the grader copy found 5 of 5 known findings, and 5 of 20 of the first five hypotheses match strictly with the open judges (25.0 percent). This holds.
- Second rule, all six audits, open judges: 11 of 14 known findings found strictly (78.6 percent), and 10 of 30 of the first five match (33.3 percent). This holds.

What we guessed before the runs: for the four small audits 3 of 5 found (range 2 to 4) and 25 percent in the first five (range 10 to 40), and we got 5 of 5 and 25.0 percent. For the two larger audits 4 of 9 found (range 2 to 6) and 20 percent in the first five (range 5 to 35), and with the open judges we got 6 of 9 and 50.0 percent.

## Result

| Audit | Lines in scope | Known | Found | Hypotheses | Scan cost (USD) |
|---|---|---|---|---|---|
| 2026-01-tempo-feeamm | 287 | 1 | 1 (grader copy), 1 (open judges, strict) | 7 | 0.14 |
| 2026-01-tempo-stablecoin-dex | 474 | 2 | 2 (grader copy), 2 (open judges, strict) | 8 | 0.11 |
| 2026-01-tempo-mpp-streams | 478 | 1 | 1 (grader copy), 1 (open judges, strict) | 8 | 0.13 |
| 2025-02-thorwallet | 298 | 1 | 1 (grader copy), 1 (open judges, strict) | 7 | 0.08 |
| 2025-03-symm-io-stacking | 1440 | 6 | 5 (open judges, strict) | 14 | 0.5 |
| 2025-05-yearn-ybold | 1067 | 3 | 1 (open judges, strict) | 10 | 0.49 |

Scan cost 1.45 dollars in total for the six audits. Scan cost is the fall of the provider's balance counter during each run; the scan's own estimate is higher and is not used. The grader copy found all of the known findings of the four small audits, which have one or two known findings each. With the open judges, strict, the two larger audits give 5 of 6 on 2025-03-symm-io-stacking and 1 of 3 on 2025-05-yearn-ybold.

Files read, from the run logs and not recomputed by check.mjs: tempo-feeamm 1 of 1, tempo-stablecoin-dex 1 of 2, tempo-mpp-streams 1 of 1, thorwallet 4 of 4, symm-io-stacking 10 of 12, yearn-ybold 12 of 20.

## Precision

Of the 54 hypotheses, 11 match a known finding strictly (20.4 percent). A hypothesis that matches no known finding counts as a miss, although it may be a real bug the audit did not list, so these shares are a floor, unless a judge matched a hypothesis to the wrong known finding. The two sets differ, so here they are apart.

| Set | Hypotheses | Strict | First five per audit | Confidence above 0.5 |
|---|---|---|---|---|
| Four small audits | 30 | 5 (16.7 percent) | 5 of 20 | 2 of 6 |
| Two larger audits | 24 | 6 (25.0 percent) | 5 of 10 | 2 of 3 |

On the larger audits the known findings include Medium severity, which gives a hypothesis more known findings to match than in the High-only set of the small audits.

## Repeat

To see how much one run moves, we ran two of the small audits a second time (run kn2, not in the totals above). 2026-01-tempo-feeamm: 1 of 1 the first time, 1 of 1 the second time. 2025-02-thorwallet: 1 of 1 the first time, 1 of 1 the second time. One known finding per audit is too little to say how much a run moves.

## What this does not say

- Few known findings: 14 in six audits, so one finding moves the share by 7.1 points. The two larger audits (1,067 and 1,440 lines in scope) are smaller than every audit of the first measurement (1,839 lines and up).
- It does not show that the setup works on contracts it has never seen, as explained above.
- The judges differ between the small and the larger audits. The two open judges are language models.
- The model, prompts and settings of the scan are not published. Outputs, judges and counting are.
- A repeat of the whole thing by someone outside our team has not happened for this folder yet.

Per audit: table.json. verdicts/ holds the grader copy's verdicts, one file per known finding. hypotheses/ holds the hypotheses as written, hypothesis-verdicts/ each open judge's answer per hypothesis, known/ the known findings of the two larger audits as the open judges saw them (id, title and the first 600 characters of the description), and reports/ the report text built from the hypotheses (the grader copy read it for the four small audits; for the two larger audits it is the same text in the same form, and the open judges judged each hypothesis). Run:

    node check.mjs

It recomputes the counts in table.json from the files and checks the hashes in SHA256SUMS. No network and no key needed. It checks the counting, not whether the judges' verdicts are right. If a number does not match, please say so in issue 41 of this repository and we will correct it and keep the old text visible.

Cite as: tokenizen (github.com/holistis), results/2026-11-02-shop-setup-six-more-audits in holistis/bug-bounty-intelligence-mcp, 2 November 2026.
