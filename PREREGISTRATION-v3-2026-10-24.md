# Pre-registration v3: a benchmark we cannot bend, and the baseline of the running scan

Written on 24 October 2026, before any run of the contests named below. The commit time of this file is the proof of that. It follows [RESULTS-v2-2026-10-24.md](RESULTS-v2-2026-10-24.md): 0 of 40 known findings, and a correction that came after it (the measured prompts lacked the pattern block that production prompts contain).

## What this file fixes

1. How the contests are chosen and split, in a way nobody here can steer.
2. How a hypothesis is matched with a known finding, and how the matching instrument was checked.
3. What is measured, with which systems, and which result makes a new version the production version.
4. A prediction for the baseline, written before the baseline runs.

What it does not fix: the design of version 3 itself. That is explored freely on the development set. Before the sealed run, the final files and their hashes are committed in an addendum to this file, and nothing changes after that.

## The contests

Source of the known findings: the final report (README) of the Sherlock judging repository of each contest, one entry per unique valid High or Medium finding, with the number of wardens who found it. That number is the difficulty: easy is found by 5 or more, middle by 3 or 4, hard by 1 or 2. This is better than the earlier test because duplicates are counted once.

Candidates: the 24 Sherlock contests from January to July 2025 that are in our local corpus. Overview with the numbers: [bench/contests-overzicht.json](bench/contests-overzicht.json). A contest is eligible if its source repository exists, the free precheck of the scan says there is in-scope Solidity, that Solidity is at most 500 KB, and the report lists at least 3 unique valid findings. 14 contests are eligible.

Split: the eligible contests are sorted by sha256(seed + contest name), where the seed is the hash of the newest Base block at the moment of writing: block 53022890, hash `0x91b7371d9902f60b3515633ffda7f89f7537bcce9a132a62fef21694f54ddd1d`, time 2026-10-24 09:45:27 UTC. The first 6 are the development set, the next 8 are the sealed set. We could not choose the seed, and anyone can recompute the split with [bench/verdeel.mjs](bench/verdeel.mjs).

Development set (6 contests, 85 known findings, full details in [bench/ontwikkelset.json](bench/ontwikkelset.json), sha256 of the canonical list `87082da019dc60c7f8c11724cd5f04fdbf4f2d6af7322c53c98e9649f79204ad`): 2025-03-crestal-network, 2025-02-yieldoor, 2025-01-peapods-finance, 2025-05-layeredge, 2025-07-cap, 2025-06-symbiotic-relay.

Sealed set: 8 contests, 105 known findings, sha256 of the canonical list `de1a23a4aabc17def5145229c8ee4b4b216e25e8a5ec990e0c5bb37620b61ca1`. The names stay out of this file and out of our working notes until the sealed run. The file with the details is kept in a private repository, with this hash as the check. We commit not to tune anything on the sealed set and not to run any system on it before the sealed run.

A limit we state now: these 2025 contests may be in the training data of the models, so absolute numbers can be too high. Comparisons between systems on the same contests are paired, so they are less affected. A clean absolute test needs contests whose reports appear after today; those are measured as they appear, with the same method, and reported as set C.

## The matching instrument

Two judges of different model families read the same question: [bench/judge.mjs](bench/judge.mjs), sha256 `cb35bd65390d9258412880fb99dedbf0939195615c0e0e842bb3eed8122bbc61`. Judge 1 is openai/gpt-oss-120b, judge 2 is deepseek/deepseek-v4-flash, both through OpenRouter at temperature 0. Each judge sees one hypothesis and the list of known findings of that contest (id, title, the first 600 characters), and says which known finding it matches, or none. A match needs the same root cause in the same code and a similar impact; a generic remark or another bug in the same function does not count.

- Strict hit: both judges name the same known finding. This is the number we report as the result.
- Lenient hit: at least one judge names it. Reported next to it.
- Every case where the judges disagree is read by a person, and a random quarter of the strict hits too. The notes go in the results.

Check of the instrument before it measures anything ([bench/kalibratie.json](bench/kalibratie.json)): a known finding offered as a hypothesis (title and the start of its text) was matched to itself 23 of 23 times by each judge, and 23 findings of another contest were matched to nothing 23 of 23 times by each judge. This only tests the plumbing and that unrelated findings are not matched. It does not test paraphrased hypotheses; the disagreement review does.

## What is measured

- Recall: unique known findings found (strict), divided by the known findings, in total and per difficulty.
- Precision: strict-matching hypotheses divided by hypotheses reported.
- Judge agreement, cost per scan (from provider costs), time per scan, coverage of the code that was read.

## The systems

S0, the baseline: the scan as it runs in production since 24 October 2026 (version 2.1, runner sha256 `a32cd07a9a2ca0cb0b419d1c3ca755f7fc17168e3b52a0ec47cebc45967ce35f`, scope module `773266ce0b8d5e6e9802e490342624a35fbcfe388bd0098138aab72966f444bb`), run through a test copy that writes the report to a folder instead of posting it (test copy sha256 `24e886376cea901985a3533866bd8b0a8f08b019daf67018872b501f14614708`, the diff is in [bench/DIFF-v2.1-production-vs-test-copy.txt](bench/DIFF-v2.1-production-vs-test-copy.txt)). Two variants, because of the correction: H0 without the block of historical patterns, H1 with it, as on the production server. The block is built from a corpus that contains these contests, so H1 can be too optimistic; if H1 does not beat H0 the question does not matter.

V3: explored on the development set only, any design, any model through OpenRouter or Together, within the budget below. Controls on the development set: Slither alone where the project compiles, and a single pass that gives the whole in-scope code to a long-context model.

## The sealed run

One run of S0 (the better of H0 and H1 on the development set) and one run of the final V3 on each contest of the sealed set, on the same day with the same sources, judged as above. Published whatever the result.

## Decision rules

- V3 becomes the production version only if, on the sealed set and with strict hits, it finds at least 5 known findings that S0 does not (b) and b is at least twice the number that S0 finds and V3 does not (c); its precision is not more than 2 points lower than S0; and a scan costs at most 1 dollar and takes at most 20 minutes.
- Otherwise production stays as it is, and the result is published all the same.
- If V3 finds nothing that S0 does not, we say so and we stop selling the scan as a way to find vulnerabilities.
- Changes after the addendum are a new version with a new pre-registration.

## Budget

At most 3 dollars of scan credit on the development set and at most 2 dollars on the sealed run. These credits are for the scan service only. If the budget is spent, the experiment stops and the result so far is published.

## Prediction, written before the baseline runs

- S0 finds at most 8 of the 85 known findings of the development set with strict hits, most likely 2 to 5, and almost all of them easy ones.
- Precision of S0 is below 10 percent.
- H1 and H0 do not differ by more than 2 findings.
- Reading more of the code and using a long-context model find at least twice as many findings as S0 on the same contests. This is the expectation that drives the design of V3; it can be wrong.
- The judges agree on at least 90 percent of the hypotheses.

## Limits

Fourteen eligible contests, 190 known findings. The judges are language models and are an interested instrument, which is why the disagreements are read by a person and the tables are published. Free and low-cost model sources are not deterministic, so each system is run once per contest. This is our own measurement.
