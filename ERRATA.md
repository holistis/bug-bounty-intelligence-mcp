# Errata

Every public statement of ours that turned out to be wrong or too strong, with the date, where it was said, what was wrong, how it was found, and what we did. Newest first. We keep the wrong wording quoted here instead of deleting it. If you find something that belongs on this list, open an issue on this repository and we add it with your name.

## 3 November 2026, open-judge answers voided without saying how many

Where: results/2026-11-02-shop-setup-five-audits/README.md and results/2026-11-02-injected-bugs-test/README.md, until 3 November 2026.
What the texts said: the figures of the two open judges (17 of 90 strict, 7 of 12 faults) without saying that some answers had been voided because the judge wrote an id that is not exactly in our list, for example H-3 for H-03.
What was wrong: three answers in the five-audits folder and one in the injected-bugs folder counted as no match and were not reported. Counted, the five-audits figure would be 17 to 20 of 90 and the injected-bugs figure 7 to 8 of 12. Five older folders hold voided answers too, 56 in total, and their figures have not been recounted.
How found: Tom Smart (smartflowproai-lang) in his recount of the five-audits folder, issue 41. We then checked every folder and found the fourth answer.
What we did: both READMEs state the correction and the range, every check.mjs of a folder with open-judge files prints the number of voided answers, the Recount workflow fails without it, and results/README.md lists the older folders with their counts. The published figures stay and the range stands next to them.

## 3 November 2026, checkers that accepted a made-up finding id

Where: check.mjs of results/2026-11-02-shop-setup-five-audits, results/2026-11-02-shop-setup-six-more-audits and results/2026-10-26-evmbench.
What the texts said: that check.mjs recounts every number and the hashes.
What was wrong: it did so for the numbers, but it did not reject a verdict that names a finding id that does not exist, so a planted made-up id passed.
How found: Darja Rihla (darjarihla-prog) showed it with a made-up id in pull request 74. We then planted a made-up id and a flipped verdict in a copy of every folder. Of the five checkers where an id can be planted, three accepted it.
What we did: pull requests 74 and 77 make the checkers of the five-audits and six-more-audits folders reject unknown ids in every precision row. The EVMbench folder still accepts one, because it does not hold the ids of the 117 known findings. That is open check 1 in results/README.md.

## 2 November 2026, the scan sold in our shop was described with an older measurement

Where: results/2026-11-02-our-scan-under-the-benchmark-judge/README.md, its row on the scoreboard of tokenizen.nl, and our comment in issue 41 of 2 November 2026.
What the texts said: that the scan sold in our shop found 8 of 20 known findings on five audits.
What was wrong: that measurement was of an earlier, simpler single-run version. The setup the shop runs reads a repository in parts and makes a second round, and it had not been measured yet.
How found: our own check of what the shop runs, the same day.
What we did: the README and the scoreboard row say so and keep the first text. The setup the shop runs was measured on 2 November: 14 of 20 on the same five audits (results/2026-11-02-shop-setup-five-audits).

## 2 November 2026, a prompt file that held the wrong prompt

Where: results/2026-11-02-shop-setup-five-audits/OPEN-JUDGES-PROMPT.txt.
What was wrong: the file first held the text of the grader copy's prompt instead of the prompt the two open judges received.
How found: our own check of the folder before the outside recounts.
What we did: the file now holds the prompt the open judges actually got, and the README says so. Their answers were not affected, because the files with their answers were always the real ones.

## 1 November 2026, we said the benchmark's own grader was out of reach

Where: results/2026-10-26-evmbench/README.md ("The one judge row is the closest we can offer to their way of counting"), the note "The ruler and the misses" on tokenizen.nl, 26 October 2026 ("the closest we can get to how the benchmark counts"), and the first version of results/2026-11-01-same-reports-different-judges/README.md ("We did not run the canonical grader's model").
What the texts said: that one free judge was the closest we could get to how the benchmark counts, and that we could not run its grader.
What was wrong: the grader of the EVMbench runner is gpt-5 with reasoning effort high (the default in evmbench/nano/runtime.py of openai/frontier-evals), and it can be called through OpenRouter for about 0.03 dollars per verdict. We assumed it was out of reach and had not read the benchmark's code for it.
How found: while looking for a way to measure on the benchmark's own grader, we read evmbench/nano/runtime.py.
What we did: ran a copy of the grader on the raw reports of 7 audits. It finds 25 of 31 known findings where their score is 26, with the same verdict on 30 of 31 findings (README section "The benchmark's own grader", folder canonical-replica/). The older sentences stay as written; this entry is the correction. Our own published runs were judged with our free judges and have not been judged again with the copy.

## 31 October 2026, a hash that no longer matched in the EVMbench results

Where: results/2026-10-26-evmbench/SHA256SUMS, from 26 October until 31 October.
What was wrong: the line for README.md still held the hash of the first version of that README (9645b6fddc496e0d8c6d54da45cf2aac2560e42f86282a531f3984b4a772e5ec, commit 16a3f43). The README was edited three times after that (pull requests 43, 44 and 46: who had recomputed the totals, and two apostrophes), so sha256sum -c failed on that one line. All other files in the folder matched.
How found: while checking the hashes of every results folder on a fresh clone, before publishing the folder of 31 October.
What we did: the README.md line of SHA256SUMS now holds the hash of the README as it stands (47667fcce2323bba1bd93f7a6db7d88780b88ccce0e5291f0cc9c5dc4add7e04). The old line is quoted here and stays in the git history. The numbers in the results are not affected, only the text of the README changed. A rule in .gitattributes (results/ with -text) now keeps the bytes of every results folder as committed, so the hashes also hold on a clone with automatic line-ending conversion.

## 31 October 2026, the scoreboard row for version 3.1

Where: the scoreboard on tokenizen.nl, the row for version 3.1 on the sealed eight (25 October 2026), from 25 October until 31 October.
What the row said: that the version was not tuned on this set, and that a scan takes about 20 to 45 seconds.
What was wrong: version 3.1 was built after the results of these 8 contests were public on 24 October, so the label should have said partly. The README of the folder says 20 to 50 seconds per scan, not 20 to 45.
How found: while preparing the rows for the two development runs of 31 October, we read the older row against its README and the dates of the commits.
What we did: the row now says partly, and both language versions carry a correction line that keeps the old wording. The sealed series on the scoreboard is unchanged. Added on 1 November 2026: the note "The scan now finds 8 of 105 on the same contests" (25 October) carried the same 20 to 45 seconds; it now has an update line at the top.

## 30 October 2026, a run missing from the scoreboard

Where: the scoreboard on tokenizen.nl, from 26 October until 30 October. The scan page said "The public scoreboard lists every run."
What was wrong: the EVMbench run of 26 October (version 3.1, 23 of 117 in the first 15 hypotheses, 29 of 117 in the first 30) was in results/2026-10-26-evmbench/ of this repository but not on the scoreboard. It was a good result and not a miss, but a page that says it lists every run has to list that one too.
How found: the check we wrote for the Publication Rule compares the folders of results/ with the rows of the scoreboard, and it named this folder.
What we did: added the row on 30 October, with the caveats of the results README (High findings only, 4 of the 40 audits overlap earlier tuning sets, the order of the rules and the run is on our word). The check now runs every week in GitHub Actions and turns red when a folder has no row after 7 days.

## 26 October 2026, who had recomputed our totals

Where: the results README for the EVMbench run, for about an hour on the evening of 26 October.
What we said: that AgenticFinanceGraph and smartflowproai-lang had asked and not yet answered.
What was wrong: both had answered already, at 16:08 and 16:30 UTC, with the same numbers and extra checks. We had read only one comment of the issue and not the whole list.
How found: smartflowproai-lang pointed out that the README still listed them as not answered (issue 41, comment 6424373805).
What we did: the README now lists all three, with what each of them checked and what they did not check.

## 26 October 2026, a query rule we pinned without measuring

Where: the known-answer vectors for section 5.5 of the x402 specification in agent-receipt-verify (0.2.19 to 0.2.21), and our checker.
What was wrong: we pinned the rule of the specification text that sorts repeated query values, so that ?q=a&q=b and ?q=b&q=a get the same identity. We tested our code against the text and never asked who can tell the two requests apart. Every library and framework we measured afterwards does (24 of 24 rows, 18 of 18 libraries and frameworks, research/repeated-query-matrix in agent-receipt-verify), so two different operations could share one identity.
How found: a review comment on x402 pull request 3776 by NSPG13 (comment 6420653774), which we then measured.
What we did: proposed arrival order instead of sorting in the pull request (comment 6421360625), prepared the changed vectors and checker as a draft (agent-receipt-verify pull request 72, not merged until the section text changes), made every vector that asserts an equivalence name its basis, with a test that fails without one, and wrote down the checklist we use before proposing a rule (REVIEW-BEFORE-PROPOSING.md).

## 26 October 2026, the first measurement of the scan

Where: the note "We measured our scan" on tokenizen.nl, in the summary line and in the first paragraph.
What we said: that the first measurement found 0 of 40 known findings.
What was wrong: the first measurement found 0 of 31 (four contests, High and Medium). The 0 of 40 is the result of version 2, which added 9 findings from three new contests to those 31. The numbers in RESULTS-2026-10-24.md and RESULTS-v2-2026-10-24.md were right, the note mixed them.
How found: a fact-check of the new post "The ruler and the misses" against the result files.
What we did: corrected the note, with a correction paragraph at its top that quotes the old wording.

## 26 October 2026, "independent" for our own checks

Where: our comment on x402 pull request 3776 (comment 6416609425), the README of the attempt-identity vectors, and the wording of seven known-answer vectors.
What we said: that a review of the vectors was independent, and that the Python implementation was independent.
What was wrong: both were done by us. The review was a pass with AI reviewers that did not write the vectors, and the Python implementation was written by us. Neither is an outside check.
How found: our own rule that an own review is never called independent, checked before publishing the blog post.
What we did: a correction line above the comment (the old text stays below it), a corrected README (pull requests 68 and 69), and corrected vector wording in 0.2.21. The first check by someone else came the same day, from ruiruii: an implementation of their own matched all seven known answers (pull request 3776, comment 6419277292).

## 26 October 2026, the vectors for section 5.5 of the x402 specification

Where: agent-receipt-verify 0.2.19 and earlier, vectors/attempt-identity.
What was wrong: a review pass found that a collapsed identity could still pass overall, that missing data counted as compliance, that the three-identifiers check demanded a canonicalized form the section says a reference must not be required to take, that a body declared ISO-8859-1 was decoded as windows-1252, that a duplicate key written with an escape escaped detection, and that an implementation that replaced every identity by another hash passed all vectors.
What we did: fixed each one with a regression test in 0.2.20, and added the known-answer vectors, which exist because of the last defect.

## 26 October 2026, what the `ground` output showed

Where: the README of agent-receipt-verify said the tool shows the binding at the payment block, at the feedback block and as it stands now.
What was wrong: the GROUNDED line is the feedback-block reading and said yes for a payment that came before the agent was registered (case 2 of erc-8004/erc-8004-contracts#99), while the payment-block reading says no. The output listed the readings only as extra facts, not side by side.
How found: running all three recorded cases of that thread on the real chain before commenting on erc-8004-contracts pull request 104.
What we did: 0.2.21 prints the three readings side by side and says when they differ.

## 24 October 2026, what the paid scan does

Where: README and directory texts for Bug Bounty Intelligence.
What was wrong: they promised more than the code that runs. The model gets at most about 22,000 characters of Solidity source per job, which was 3 to 7 percent of the source on three recent contests. The 7-gate filter is not part of the paid scan, and test and mock folders are not skipped.
How found: reading the code that the process manager actually starts, and measuring the coverage, instead of trusting the README.
What we did: the README now states these limits (section "Correction and limits (24 October 2026, before version 2)") and the measured results are in RESULTS-2026-10-24.md and RESULTS-v2-2026-10-24.md.
