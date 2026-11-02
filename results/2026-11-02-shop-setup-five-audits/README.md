# The setup behind our deep scan, on five audits, 2 November 2026

Until now the setup behind the deep scan in our shop had never been measured: our earlier shop measurement of 1 November used an older, simpler route (see the correction in results/2026-11-02-our-scan-under-the-benchmark-judge). This folder is the first measurement of the current setup. It reads a repository in parts and makes a second round. We ran the same scan code, model and thinking limit as the shop, from a script on our own machine, with a flat cost limit of 1.50 dollars per audit. Same copy of the EVMbench detect grader as in the other folder (gpt-5, reasoning effort high, the benchmark's grading prompt in JUDGE-PROMPT.txt, one call per known finding).

## Result

Five audits, 20 known findings, all High. One run per audit.

| Audit | Lines in scope | Known | Found | Scan cost (USD) |
|---|---|---|---|---|
| 2023-10-nextgen | 11,580 | 2 | 2 | 1.58 |
| 2024-06-size | 4,092 | 4 | 1 | 1.58 |
| 2024-08-phi | 2,854 | 6 | 4 | 0.92 |
| 2024-12-secondswap | 1,839 | 3 | 3 | 0.56 |
| 2025-04-forte | 2,199 | 5 | 4 | 1.24 |
| Together | | 20 | 14 (70.0 percent) | 5.88 |

On the same five audits, from results/2026-11-02-our-scan-under-the-benchmark-judge: the leader's own report finds 15 of 20, one run of our research agents 14 of 20, a union of six research runs 16 of 20, and the earlier shop route 8 of 20 (40.0 percent). The research runs are not the product; the shop scan is the one measured here.

Where the gain over 8 of 20 comes from: the earlier route was stopped by its cost cap on forte and delivered nothing there, so forte counted as 0 of 5. On the other four audits the earlier route found 8 of 15 and this setup 10 of 15. Four of the six extra findings are forte finishing within its limit.

The scan cost is what our provider's counter showed per run, in dollars, without the judge. The 20 verdicts cost 0.49 dollars by the figures in the verdict files.

## What this does and does not say

- Five audits and one run each. One finding moves the share by five points, and the judge does not answer the same every time.
- These are development audits from 2023 to 2025. Older contests may be in the training data of the model behind the scan. This is not a result on new contracts.
- We took the five audits the earlier shop measurement used, so the comparison with 8 of 20 is on the same set. The hardest audit, 2024-04-noya, is not in it.
- Our cost limit of 1.50 dollars stopped two runs: 2024-06-size at 1.58 dollars after 10 hypotheses, and 2023-10-nextgen at 1.58 dollars with 48 of its 76 source files read. Both are counted with what they had found by then. The shop's own cost limits depend on the size of the repository and we have not measured what they would do on these two, so we do not say whether the figure for them is high or low.
- When the guard stops a shop scan, the remaining parts are skipped and the customer receives the report with what was found so far, marked as partial.
- The runs did not read every source file: 14 of 20 on phi, 48 of 76 on nextgen, 37 of 39 on size, all files on secondswap and forte. A finding in a file that was not read cannot be found.
- The leader is ahead by one finding here, and on 2024-08-phi our run found H-06, which the leader's report does not.
- The cheaper shop routes at 1 and 5 USDC are older and are not measured here.
- The judge is a copy running through OpenRouter, not the benchmark's own run. It gave the same verdict as the benchmark's answer on 30 of 31 findings when we checked it on the leader's report (see the other folder).
- The model, prompts and settings of the scan are not published. Outputs, judge and counting are.
- We wrote a guess down before the second set of runs: 5 of 11 on secondswap, phi and nextgen. The result was 9 of 11. The note with the guess is in a private repository, so you cannot check its time stamp.

Per audit and per finding: table.json, and verdicts/ with the judge's reasoning in one file each. reports/ holds the exact report text the judge read for each audit. The lines-in-scope column comes from the shop's own counter and is not recomputed by check.mjs.

## Check it

    node check.mjs

It recomputes every count in table.json from the verdict files and checks the hashes in SHA256SUMS. No network and no key needed. If a number does not match, please say so in issue 41 of this repository and we will correct it and keep the old text visible.

Cite as: tokenizen (github.com/holistis), results/2026-11-02-shop-setup-five-audits in holistis/bug-bounty-intelligence-mcp, 2 November 2026.
