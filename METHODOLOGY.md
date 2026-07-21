# Methodology: acceptance-rate data behind `list_vulnerability_patterns`

**Last updated: 2026-07-21.**

## What this covers

`list_vulnerability_patterns` returns, per vulnerability class, what fraction of *submitted*
audit-competition findings were judged valid. This document explains exactly how those numbers
are computed, what they don't claim, and how to reproduce them from public data.

## Data source

Sherlock runs public GitHub repos for judging each audit contest
(`sherlock-audit/<contest>-judging`), where security researchers ("Watsons") open one GitHub
issue per submitted finding. 105 of these judging repos were crawled (27,681 raw submitted
findings total, 2024-02 through 2025-07).

## The problem: "was this accepted?" is not reliably answerable from GitHub alone

An early version of this pipeline inferred acceptance from GitHub issue state
(`OPEN` = accepted, `CLOSED` = rejected). That heuristic turned out to be wrong, in both
directions, depending on the contest — sometimes undercounting acceptance by an order of
magnitude, sometimes overcounting it. GitHub issue labels (`Reward`, `Non-Reward`, `Invalid`,
etc.) turned out to be applied inconsistently across contests too — some contests label every
issue, some label almost none.

## The fix: use Sherlock's own result structure, and only trust it when it reconciles

Sherlock's judging repos also contain, at the repo root, a folder per accepted finding
(`001-M/`, `002-H/`, etc. — number + severity), each containing one file per GitHub issue number
that was judged to be that finding (the primary write-up plus any duplicates), and a separate
`invalid/` folder for rejected issue numbers. This is Sherlock's own authoritative accounting,
not an inference.

We only trust this for a given contest if it **reconciles exactly**:
`accepted_issue_numbers + invalid_issue_numbers === total_submitted_issues`.

If a contest's folder structure doesn't exist, or doesn't reconcile exactly, that contest is
**excluded entirely** — not estimated, not approximated. Of 105 crawled contests:

- **10 reconcile exactly** and are used for `list_vulnerability_patterns`: 1,032 findings, 461
  accepted.
- **95 do not** — either no accepted/invalid folder structure exists in that judging repo (a
  likely explanation: some contests use a different Sherlock judging workflow that doesn't
  generate this structure), or the counts don't sum to the known total (a likely explanation for
  many of these: the original crawl capped issue retrieval at 500 per contest, so large contests'
  true totals exceed what was captured — a fixable crawler limitation, not a Sherlock data
  problem, but not yet re-verified).

## What the resulting numbers mean

For each pattern (keyword-matched against finding titles/bodies — e.g. "reentrancy",
"oracle manipulation"), the acceptance rate is: of all submissions whose issue number appears in
*any* accepted-finding folder (including duplicates of the same underlying bug), what fraction
of total tagged submissions that is. This measures **submission-level reliability** — "if
someone writes up and submits a claim of this bug class, how often does it hold up" — not the
number of distinct vulnerabilities found.

## What this does not claim

- Not a claim about real-world exploit frequency — this is pre-deployment audit-competition
  data, not realized incidents.
- Not a claim about detection coverage — it describes submitted reports, not silent misses.
- The keyword-based pattern tagging is a simple substring matcher (see `detectPatterns()` in the
  crawler scripts), not a semantic classifier — a manual audit found roughly 65% tagging
  precision on a sample. Pattern labels are directional, not exact classifications.
- The 10-contest sample is small. Some pattern rows have thin n (e.g. `liquidation`, n=14) —
  treat low-n rows as lower-confidence than high-n rows (e.g. `trusted-actor`, n=311).

## Reproducing this

Everything below uses only public data — no private API, no authentication required beyond
default `gh` CLI rate limits.

```bash
# 1. List Sherlock judging repos
gh repo list sherlock-audit --limit 1000 --json name | jq -r '.[] | select(.name | endswith("-judging")) | .name'

# 2. For a given contest, pull its full file tree and look for the NNN-severity / invalid folders
gh api repos/sherlock-audit/<contest>-judging/git/trees/main?recursive=1 \
  | jq '[.tree[].path | select(test("^[0-9]{3}-[HM]/|^invalid/"))]'

# 3. Cross-check reconciliation against the contest's total issue count
gh api "repos/sherlock-audit/<contest>-judging/issues?state=all&per_page=100" | jq 'length'
```

A finding's issue number appearing under any `NNN-[HM]/` path = accepted. Under `invalid/` =
rejected. If `accepted + invalid !== total`, do not use that contest's data.

## Why we publish this instead of just the bigger, older number

An earlier draft of this tool advertised acceptance percentages computed from the full,
unverified 27,681-finding corpus. Independent review caught that those specific percentages
were unreliable. We would rather ship a smaller number we can prove than a bigger one we can't.
