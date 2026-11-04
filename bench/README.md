# Benchmark of the scan (version 3 and the baseline)

Everything here belongs to [PREREGISTRATION-v3-2026-10-24.md](../PREREGISTRATION-v3-2026-10-24.md). Nothing here changes the scan.

- registry-bouwen.mjs: builds the register of contests (unique valid High and Medium findings per Sherlock contest from the final report, with the number of finders).
- verdeel.mjs: splits the eligible contests into a development set and a sealed set with a public seed (a Base block hash). Anyone can recompute it.
- ontwikkelset.json, verklaring.json, contests-overzicht.json: the development set with its details, the statement with the hashes (the sealed set is only given as a count and a hash), and the overview of all candidate contests.
- judge.mjs and judge.test.mjs: the two judges, the prompt and the scoring, with tests. kalibreer.mjs and kalibratie.json: the check of the instrument.
- scorekaart.jsonl, kandidaten.json, kies-rechters.mjs: the scorecard of the judges. See "Qadi" below.
- hertel-oudere-mappen.mjs: recounts the three older folders whose raw files keep a verdict per hypothesis, from data already in this repository, no new judge calls. See "Qadi" below.
- draai-basis.sh: how the baseline is run on the server. testkopie-v2.1: the test copy of the scan and its scope module.

## Qadi, the judges

The judges are called Qadi (the one who rules on a case). The file names stay as they are, because the READMEs of the sealed folders link to bench/judge.mjs and their hashes depend on it.

How a Qadi is chosen, with numbers that anyone can check:

- kalibreer.mjs runs a model over the known findings (positive cases) and over made-up findings that exist nowhere (negative cases) and writes one line per model to scorekaart.jsonl: hits, misses, wrongly matched, nonsense hits, voided answers, cost.
- kies-rechters.mjs reads the newest line per model and advises two: the fewest errors first, then the lowest cost, from two different model families. A strict hit needs both to name the same finding.
- The judges of a run that was registered in advance stay fixed in judge.mjs (OORDEELDERS). The scorecard only gives the advice for the next registration.

First scorecard (4 November 2026, 23 positive and 23 negative cases, six candidates): five models made no error, gemini-2.5-flash-lite missed 2 cases, made 1 nonsense hit and gave 2 voided answers. This check does not separate the five that made no error, so among them the choice falls on cost: gpt-oss-120b and deepseek-v4-flash, the pair already registered. The same models are not guaranteed to stay on top on a harder set.

Two things added the same day, both aimed at the 56 voided answers Tom Smart found in the older folders:

- An unreadable answer (no JSON, broken JSON) is now asked again once, with a sharper reminder, instead of being voided right away. An unknown id (a made-up number) is not asked again, since that is not a reading problem.
- When the two registered judges disagree, a third judge from kies-rechters.mjs (the best measured candidate from a still-unused model family) is asked the same question. It only breaks the tie when it names the same finding as one of the two; naming something else, or being unreadable itself, leaves the disagreement standing. Two voided answers are still not a match, with or without a third opinion.

Both are measured the same way as the judges themselves (bench/judge.test.mjs, bench/rechters-slimmer.test.mjs), and only change behavior once a scorecard with a third candidate family exists.

Run the tests with: node --test bench/*.test.mjs
