# Methodology: acceptance-rate data behind `list_vulnerability_patterns`

**Last updated: 2026-11-12.**

## What this covers

`list_vulnerability_patterns` returns, per vulnerability class, what fraction of *submitted*
audit-competition findings were judged valid. This document explains exactly how those numbers
are computed, what they don't claim, and how to reproduce them from public data.

## Data source

Sherlock runs public GitHub repos for judging each audit contest
(`sherlock-audit/<contest>-judging`), where security researchers ("Watsons") open one GitHub
issue per submitted finding. 218 of these judging repos were crawled; a real issue count could be
confirmed for 212 of them, 56,657 raw submitted findings total (2022-09 through 2025-02).

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
**excluded entirely** — not estimated, not approximated. Of 218 crawled contests:

- **35 reconcile exactly** and are used for `list_vulnerability_patterns`: 7,388 findings, 3,694
  accepted.
- **183 do not** — either no accepted/invalid folder structure exists in that judging repo (a
  likely explanation: some contests use a different Sherlock judging workflow that doesn't
  generate this structure), or the counts don't sum to the real total.

**2026-11-12 re-verification.** The original 2026-07-21 run (105 contests, 1,032 reconciled
findings) turned out to rest on a locally cached issue count that was itself wrong for most
contests, not only for the handful capped at the documented 500-issue crawl limit. Spot check: the
cache said `2022-09-knox-judging` had 12 submissions; the real count is 153.
`2024-02-optimism-2024-judging` showed 4; the real count is 251. The fix was to stop trusting any
locally cached total and re-derive it fresh from GitHub's search API for every contest, which is
also how the reconciliation check itself works (see Reproducing this, below). Re-running the exact
same reconciliation rule this way, with no local cache in the loop, is what produced the 35/7,388/
3,694 figures above.

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
- The 35-contest sample is still small relative to the full Sherlock history. Some pattern rows
  have thin n (e.g. `idor`, n=18) — treat low-n rows as lower-confidence than high-n rows (e.g.
  `trusted-actor`, n=1,814).

## Reproducing this

Everything below uses only public data — no private API, no authentication required beyond
default `gh` CLI rate limits.

```bash
# 1. List Sherlock judging repos
gh repo list sherlock-audit --limit 1000 --json name | jq -r '.[] | select(.name | endswith("-judging")) | .name'

# 2. For a given contest, pull its full file tree and look for the NNN-severity / invalid folders
gh api repos/sherlock-audit/<contest>-judging/git/trees/main?recursive=1 \
  | jq '[.tree[].path | select(test("^[0-9]{3}-[HM]/|^invalid/"))]'

# 3. Cross-check reconciliation against the contest's REAL total issue count. Do not paginate
#    an issues?state=all list and take its length: that silently undercounts the moment a
#    contest has more issues than one page covers, which is most of them. The search API's
#    own total_count does not have this problem.
gh api "search/issues?q=repo:sherlock-audit/<contest>-judging+type:issue" --jq .total_count
```

A finding's issue number appearing under any `NNN-[HM]/` path = accepted (strip any leading
zeros before comparing to the issue number from the GitHub API, the folder names are zero-padded
and the API numbers are not). Under `invalid/` = rejected. If `accepted + invalid !== total`, do
not use that contest's data.

## Why we publish this instead of just the bigger, older number

An earlier draft of this tool advertised acceptance percentages computed from the full,
unverified raw corpus. Independent review caught that those specific percentages were
unreliable. We would rather ship a smaller number we can prove than a bigger one we can't. That
is still true today: the raw corpus is 56,657 findings, the reconciled, trustworthy number
published here is 7,388.
