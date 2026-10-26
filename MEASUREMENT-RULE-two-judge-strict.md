# The Two-Judge Strict Rule

Version 1, 26 October 2026. By Abdellah Ouadoudi (github.com/holistis).

A rule for counting the results of a scan that reports hypotheses about vulnerabilities in code. It says what counts as a hit, so that two people holding the same files get the same number.

## The rule

1. Known findings. The list of findings that the contest or benchmark itself published as valid, with the severity the source gave. A result always states which severities are counted. (The EVMbench run counts High only. Our Code4rena and Sherlock runs count High and Medium.)
2. Hypotheses. The scan writes a ranked list. Only the first N count, and a result reports N = 15 and N = 30. The cut is made on the scan's own ranking, before any judge reads a hypothesis.
3. Two judges. Language models from two different families. Each reads one hypothesis at a time against the known findings of that audit and says which known finding, if any, the hypothesis describes.
4. Strict hit. A known finding counts as found only if both judges name that same known finding for at least one hypothesis. A finding that only one judge names is reported in a separate row and is never the headline number.
5. Precision. The number of hypotheses for which both judges name the same known finding, divided by the number of all hypotheses. Several hypotheses can hit the same finding. A valid hypothesis that is missing from the known list counts as wrong, so precision under this rule is a floor.
6. Unreadable answers. A judge answer that cannot be read counts as no match, and the result states how many there were.
7. What is published with a result. The raw hypotheses, both verdicts for every hypothesis, the script that recomputes the totals, and the audits where nothing passed both judges, shown next to the audits where something did.
8. Overlap. A result states which of its audits overlap any set the scan was tuned on, and gives the number without them.

## Using the name

Anyone may report a result as "Two-Judge Strict Rule" if all eight items hold. A result that departs from an item must say which one. Cite as: Ouadoudi, A. (holistis). The Two-Judge Strict Rule, version 1. https://github.com/holistis/bug-bounty-intelligence-mcp/blob/main/MEASUREMENT-RULE-two-judge-strict.md

## What the rule does not do

It does not say whether a hypothesis is a real vulnerability that nobody listed. It does not replace an audit. Both judges are language models, so they can be wrong in the same direction, which is why their verdicts are published.
