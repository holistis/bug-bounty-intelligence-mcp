# Concentration signals over a public file of payment-grounded feedback, 2 November 2026

AgenticFinanceGraph publishes a file of ERC-8004 feedback entries on Base that follow a payment from the rater to the rated agent's bound wallet (fixtures/erc8004-base-grounded-feedback-2026-11-01.csv, commit 7b3763d). It states that on chain nothing separates a payer and a seller run by one hand from two independent parties. That limit stays. This folder measures what the file itself does show: how few raters stand behind how many rows, and what one more row costs.

Input: the file at commit 7b3763d, sha256 f38882fbfdad847e34680a7627335fce9de12873c84833a240c038c32c37a502.

| Signal | Value |
|---|---|
| Rows | 840 |
| Raters | 23 |
| Agents | 75 |
| Share of the rows from the largest rater | 52.9 percent |
| Share of the rows from the three largest raters | 88.3 percent |
| Agents rated by exactly one rater | 68 of 75 |
| Median payment behind a row | 0.03 USD (smallest 0.002, largest 6) |

What this says and does not say:
- It says that most of the file rests on three raters, that most agents have one rater, and that a row typically stands on a payment of a few cents.
- It does not say that any row is fake, and it does not say which raters are independent of the agents they rate. A funding trace (who first funded each rater, and whether that is the rated party) would add a signal, but this folder does not contain one yet: the free block-explorer interfaces we tried do not serve Base.
- It does not look at the quality of the feedback itself.

Suggestion for the file, if it helps: three columns per row, the number of distinct raters of that agent, the share of the largest rater of that agent, and the payment in USD. They follow from columns the file already has.

To recount, no network and no key:

    curl -sO https://raw.githubusercontent.com/AgenticFinanceGraph/agentic-finance-graph-spec/7b3763d/fixtures/erc8004-base-grounded-feedback-2026-11-01.csv
    node independence-signals.mjs erc8004-base-grounded-feedback-2026-11-01.csv

The output should equal signals-2026-11-01.json in this folder. If a number does not match, please say so in issue 41 of this repository and I will correct it and keep the old text visible.

Cite as: tokenizen (github.com/holistis), results/2026-11-02-independence-signals-afg-fixture in holistis/bug-bounty-intelligence-mcp, 2 November 2026.

## Recomputed by someone else

AgenticFinanceGraph recounted our numbers from the file on 3 November 2026 (comment 6599222186 in erc-8004/erc-8004-contracts, issue 99): 23 raters, the three largest raters behind 88.3 percent of the 840 rows, the largest behind 52.9 percent, 68 of 75 agents with one rater, a median payment of 0.03 USD. They matched.

They also traced the earliest inbound transfer to each of the 23 raters on Base. This is their result, and we have not recounted it: 7 raters share one first funder, a contract, and wrote 123 of the 840 rows; 3 more share another first funder and wrote 16 rows; the two largest raters each have a first funder of their own. A shared first funder is a pattern, not a finding about any rater. Their script and output: github.com/AgenticFinanceGraph/agentic-finance-graph-spec/tree/b61f810/fixtures
