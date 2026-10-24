# Benchmark of the scan (version 3 and the baseline)

Everything here belongs to [PREREGISTRATION-v3-2026-10-24.md](../PREREGISTRATION-v3-2026-10-24.md). Nothing here changes the scan.

- registry-bouwen.mjs: builds the register of contests (unique valid High and Medium findings per Sherlock contest from the final report, with the number of finders).
- verdeel.mjs: splits the eligible contests into a development set and a sealed set with a public seed (a Base block hash). Anyone can recompute it.
- ontwikkelset.json, verklaring.json, contests-overzicht.json: the development set with its details, the statement with the hashes (the sealed set is only given as a count and a hash), and the overview of all candidate contests.
- judge.mjs and judge.test.mjs: the two judges, the prompt and the scoring, with tests. kalibreer.mjs and kalibratie.json: the check of the instrument.
- draai-basis.sh: how the baseline is run on the server. testkopie-v2.1: the test copy of the scan and its scope module.

Run the tests with: node --test bench/judge.test.mjs
