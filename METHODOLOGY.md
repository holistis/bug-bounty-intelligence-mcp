# Methodology: acceptance-rate data behind `list_vulnerability_patterns`

**Last updated: 2026-11-12.**

## What this covers

`list_vulnerability_patterns` returns, per vulnerability class, what fraction of *submitted*
audit-competition findings were judged valid. This document explains exactly how those numbers
are computed, what they don't claim, and how to reproduce them from public data.

## Data source

Two platforms, two different public data shapes, two different reconciliation rules (same
zero-tolerance standard on both). Sherlock first, Code4rena below.

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

## Code4rena: a different shape, a much smaller yield

Code4rena's `code-423n4/<contest>-findings` repos do not have Sherlock's accepted/invalid folder
convention. Contests from 2021-2023 instead use per-researcher folders
(`<researcher>/<researcher>-submission.md`) with no accept/reject marker in the file tree at
all. Contests from roughly late 2024 onward move the judging data off GitHub entirely; the repo
is reduced to a README pointing sponsors at code4rena.com (verified on
`2024-12-unruggable-findings`: the repo contains only that README).

What the 2023-era contests do have is GitHub issues with labels, including `satisfactory`,
`unsatisfactory`, and `partial-NN` (a duplicate that earned partial credit). We tested this
against five real contests spanning 2021 to 2024: the two 2021-2022 contests sampled had zero
issues carrying any of these labels (a different, unidentified labelling convention was in use),
while three contests from October 2023 reconciled exactly once `satisfactory`/`partial-NN`
(accepted), `unsatisfactory`/`withdrawn-by-warden` (rejected), and
`qa`/`gas optimization`/`analysis`-only issues (excluded, same treatment as Sherlock's
`low_info`) were counted against the real issue total.

Applying the same zero-tolerance rule (accepted + rejected + excluded must equal the real
total, with zero unexplained residual) to all 372 crawled Code4rena judging repos: **3 reconcile
exactly** (1,812 findings, 317 accepted), all three from October 2023. The other 369 either have
no GitHub-issue judging data at all, or have labels that don't account for every issue. This is
a small, honest addition on top of Sherlock, not padding — most of Code4rena's history is
excluded for the same reason most of Sherlock's is: it does not reconcile.

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
- The 38-contest sample (35 Sherlock, 3 Code4rena) is still small relative to either platform's
  full history. Some pattern rows have thin n (e.g. `idor`, n=35) — treat low-n rows as
  lower-confidence than high-n rows (e.g. `trusted-actor`, n=2,127).
- Code4rena's three contests are a narrow, single-month slice (all October 2023), not a
  representative sample of Code4rena's history. Treat the combined numbers as Sherlock-dominated
  (7,388 of 9,200 findings), with Code4rena adding a small, real, but not yet broad correction.

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
is still true today: the raw Sherlock corpus alone is 56,657 findings, the reconciled,
trustworthy number published here (Sherlock plus the three Code4rena contests that also
reconcile) is 9,200.
