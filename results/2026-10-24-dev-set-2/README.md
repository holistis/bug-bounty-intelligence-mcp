# Development set results, part 2, 24 October 2026

Scored outputs of two more runs on the development set of [PREREGISTRATION-v3-2026-10-24.md](../../PREREGISTRATION-v3-2026-10-24.md), added to the three in [part 1](../2026-10-24-dev-set/README.md). Same 6 contests, 85 known findings, same judges.

These numbers are not evidence. The development set is the set we tune on. What counts is the sealed run.

## What was run

| Prefix | System | Contests that ran | Found (strict) | Precision (strict) | Time per contest | Cost per contest |
|---|---|---|---|---|---|---|
| G | The next version, a faster setting of the first trial. How it works is not described here | 6 of 6 | 5 of 85 | 6.7 percent | 39 to 112 seconds | 0.005 to 0.065 dollar |
| H | The same with repeated reading and a different ranking | 4 of 6 | 4 of 85 | 10.0 percent | 103 to 511 seconds | 0.009 to 0.076 dollar |

By difficulty: G found 5 of 31 easy, 0 of 26 middle and 0 of 28 hard. H found 4 of 31 easy, none of the others. The judges agreed on 97 percent (G) and 98 percent (H) of the hypotheses.

For comparison from part 1: h1 (the scan as it runs) 1 of 85, h0 0 of 85, A 7 of 85. A took 654 to 2726 seconds per contest; 4 of its 6 contests took longer than the 20 minutes the pre-registration allows, so A cannot be the production version whatever it scores.

## What went wrong, so that nobody has to guess

The last two contests of H (2025-07-cap and 2025-06-symbiotic-relay) did not run. The provider answered every request with status 402, because the credit of the account was spent (credit 10.00 dollars, usage 10.20). The runner did not stop on that status and wrote files with 0 hypotheses, which look like a result and are not one. Those two files are not published, and the totals of H above count only the 4 contests that ran. The runner now stops at the first 401, 402 or 403, with a test for it. A second run with a larger hypothesis limit (called H30 in our notes) was started after H and stopped by hand once we saw the 402; it produced nothing.

Runs that were started and not scored: a parallel version of A (two tries), two settings that limit the thinking of the model (E and F), and a short check of the frozen files on the smallest contest (15 hypotheses in 47 seconds). They are mentioned so that the count of runs is complete. Our cost log did not count the requests that came back empty, so the dollars in our own logs are lower than what the provider charged: the key of the scan showed 2.94 dollars used when we checked after the credit ended, and our logs add up to about 1.2 dollars. We do not know exactly where the difference went. The likely cause is requests that came back empty.

## Files

- `res-G.json`, `res-H.json`: per contest, every hypothesis with both judges' statements, plus totals.
- `judge-G.log`, `judge-H.log`: console output of the scoring runs.
- `raw/`: the hypotheses that were scored, named `<prefix>__<contest>.json`, as a reader of a report would see them. Settings, model names and per-call records are not published.

Score it yourself the same way as part 1, with prefix `G` or `H`.

SHA-256 of every file in this folder is in [SHA256SUMS](SHA256SUMS).
