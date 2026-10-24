# Sealed set results, 24 October 2026

The one run on the sealed set, as promised in [PREREGISTRATION-v3-2026-10-24.md](../../PREREGISTRATION-v3-2026-10-24.md) and its Addendum 1. 8 Sherlock contests of 2025 that nobody here had run anything on, 105 known High and Medium findings. The set is the one the pre-registration fixed: the SHA-256 of its canonical list is `de1a23a4aabc17def5145229c8ee4b4b216e25e8a5ec990e0c5bb37620b61ca1`, and the details are published now in [bench/verzegelde-set.json](../../bench/verzegelde-set.json) so that anyone can recompute that hash and score the outputs again.

## The result

| System | Found (strict) | Found (one judge) | Hypotheses | Precision (strict) | Time per scan | Cost per scan |
|---|---|---|---|---|---|---|
| S0, the scan as it runs in production (h1) | 1 of 105 (1.0 percent) | 1 | 43 | 4.7 percent | 2.7 to 8.6 minutes | not recorded |
| V3, the version frozen in Addendum 1 (prefix G) | 4 of 105 (3.8 percent) | 6 | 120 | 5.0 percent | 46 to 105 seconds | 0.012 to 0.064 dollar |

By difficulty (easy is found by 5 or more wardens, middle by 3 or 4, hard by 1 or 2): S0 found 1 of 59 easy, 0 of 14 middle and 0 of 32 hard. V3 found 2 of 59 easy, 0 of 14 middle and 2 of 32 hard. The judges agreed on 100 percent (S0) and 98 percent (V3) of the hypotheses. The whole V3 run of 8 contests cost 0.27 dollars.

Strict means both judges, of different model families, named the same known finding for the same root cause ([bench/judge.mjs](../../bench/judge.mjs), unchanged, `cb35bd65390d9258412880fb99dedbf0939195615c0e0e842bb3eed8122bbc61`).

## The decision rule, applied as written

The rule asked for strict hits, at least 5 findings that V3 finds and S0 does not (b), b at least twice the number S0 finds and V3 does not (c), precision not more than 2 points lower, at most 1 dollar and 20 minutes per scan.

- b = 3: V3 found three known findings that S0 did not (the first-depositor inflation in 2025-05-yearn-ybold, the duplicate signers in 2025-07-mellow-flexible-vaults, the redeem rounding in 2025-07-malda). Not met, the rule needs 5.
- c = 0: S0 found one, and V3 found it too (the claimRefund authorization flaw in 2025-05-dodo-cross-chain-dex).
- Precision: 5.0 against 4.7 percent. Met.
- Cost and time: at most 0.064 dollar and 105 seconds per scan. Met.

The rule is not met, so V3 does not become the production version. Production stays as it is. The third line of the rule, which stops us from selling the scan as a way to find vulnerabilities if V3 finds nothing that S0 does not, does not apply either: V3 found three that S0 did not.

## What a person read, and what it would change

The pre-registration says every disagreement between the judges and the strict hits are read by a person. This is our own reading, which is not independent, and it did not change a number above.

- Strict hits of V3. Duplicate signers in `Consensus.checkSignatures` and the unauthorized `claimRefund` are the same flaw as the known finding. The first-depositor inflation of the strategy shares is the same root cause as the known finding. The redeem rounding is weaker: the title and the function match the known finding, but the description contradicts itself about which direction the rounding goes. We count it because both judges did and flag it here.
- The two disagreements, both V3. In 2025-03-symm-io-stacking one judge matched a hypothesis about `__vesting_init` and its `initializer` modifier to the known finding about that same modifier; the other did not. In 2025-07-malda one judge matched a hypothesis about a stale `transferInfo` in `Rebalancer.sendMsg` to the known finding about the stale value there; the other did not. Reading them, both look like the known root causes, with attack paths that are partly off.
- If those two were counted, V3 would have 6 strict hits, b would be 5 and c 0, and the count condition would be met. We do not count them, because the registered number is the one both judges agree on. We report it so that nobody has to guess how close this was: the strict result misses the bar by two findings, and our own reading would have reached it.

## What this does and does not say

- V3 found 4 of the known findings against 1 for the scan in production, and it takes about a minute instead of several. On the development set it found 5 of 85 (5.9 percent) after we tuned on that set; on this set it found 4 of 105 (3.8 percent), so the gap between the two is small.
- It still finds few: 101 of 105 known findings were not found, including 57 of the 59 easy ones and all 14 middle ones. Nobody should read this as a scan that finds what a human audit finds.
- 2025 contests may be in the training data of the models, so absolute numbers can be too high. Each system was run once per contest. The judges are language models. This is our own measurement.

## Files

- `res-h1.json`, `res-G.json`: per contest, every hypothesis with both judges' statements, plus the totals. Prefix `h1` is S0, prefix `G` is V3.
- `judge-h1.log`, `judge-G.log`: console output of the scoring runs.
- `raw/`: the hypotheses that were scored, named `<prefix>__<contest>.json`, as a reader of a report would see them. Settings, model names and per-call records of V3 are not published.

Score it yourself with an OpenRouter key in the environment:

```sh
OPENROUTER_API_KEY=... node bench/beoordeel.mjs bench/verzegelde-set.json results/2026-10-24-sealed/raw G out.json
```

The prefix is `G` or `h1`. SHA-256 of every file in this folder is in [SHA256SUMS](SHA256SUMS).
