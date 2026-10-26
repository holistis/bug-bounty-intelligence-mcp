# Errata

Every public statement of ours that turned out to be wrong or too strong, with the date, where it was said, what was wrong, how it was found, and what we did. Newest first. We keep the wrong wording quoted here instead of deleting it. If you find something that belongs on this list, open an issue on this repository and we add it with your name.

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
