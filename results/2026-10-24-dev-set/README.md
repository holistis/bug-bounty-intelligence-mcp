# Development set results, 24 October 2026

These are the scored outputs of three runs on the development set of [PREREGISTRATION-v3-2026-10-24.md](../../PREREGISTRATION-v3-2026-10-24.md): 6 Sherlock contests of 2025 with 85 known High and Medium findings ([bench/ontwikkelset.json](../../bench/ontwikkelset.json)).

**These numbers are not evidence.** The development set is the set we tune on. A system that was shaped while looking at these contests scores well on them and proves nothing. They are published because the record of how we got here belongs next to the claims we make later. What counts is the sealed run, whose rule was written before any of this ran.

## What was run

| Prefix | System | Known | Found (strict) | Found (one judge) | Hypotheses | Precision (strict) |
|---|---|---|---|---|---|---|
| h1 | The scan as it runs, with the pattern block that production carries | 85 | 1 | 3 | 39 | 2.6 percent |
| h0 | The same without the pattern block | 85 | 0 | 1 | 36 | 0.0 percent |
| A | The next version, first trial. How it works is not described here | 85 | 7 | 7 | 88 | 12.5 percent |

By difficulty (easy is found by 5 or more wardens, middle by 3 or 4, hard by 1 or 2): h1 found 0 of 31 easy, 0 of 26 middle and 1 of 28 hard. h0 found none. A found 7 of 31 easy, 0 of 26 middle and 0 of 28 hard.

Strict means both judges, of different model families, named the same known finding for the same root cause ([bench/judge.mjs](../../bench/judge.mjs), calibrated in [bench/kalibratie.json](../../bench/kalibratie.json)). The judges agreed on 95 to 97 percent of the hypotheses.

## What is in this folder

- `res-h1.json`, `res-h0.json`, `res-A.json`: per contest, every hypothesis with both judges' statements, plus the totals.
- `judge-*.log`: the console output of the scoring runs.
- `raw/`: the hypotheses that were scored, named `<prefix>__<contest>.json`. For A they contain only the hypotheses as a reader of a report would see them. Settings, model names and per-call records of the next version are not published.

## Score it yourself

The scorer and the judges are open. With an OpenRouter key in the environment:

```sh
OPENROUTER_API_KEY=... node bench/beoordeel.mjs bench/ontwikkelset.json results/2026-10-24-dev-set/raw h1 out.json
```

The prefix is `h1`, `h0` or `A`. Each run costs two to four cents in judge calls. If your totals differ from ours, open an issue with the file that disagrees.

## What stays private, and why that does not weaken the claim

How the next version finds things stays private until after the sealed run, because that is the product. How it is measured is all here: the contests, the split, the judges, the rules written before the run and every output. Before the sealed run we publish the SHA-256 of the files the scan uses, so they cannot change afterwards, and anyone can re-score the published outputs with the open judges.

SHA-256 of every file in this folder is in [SHA256SUMS](SHA256SUMS).
