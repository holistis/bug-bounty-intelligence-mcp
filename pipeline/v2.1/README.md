# Pipeline v2.1: version 2 plus one parser fix

Deployed on 24 October 2026, after the measurement of version 2 was published in [RESULTS-v2-2026-10-24.md](../../RESULTS-v2-2026-10-24.md). The only change: the parser that reads the model's answer now reads field by field, so an empty FUNCTION line stays empty instead of taking the next line (the description) as its value. That also stops the filter for invented functions from dropping contract-wide hypotheses for the wrong reason. The function moved from the runner into bug-intel-scope.mjs so that it can be unit tested (pipeline/v2.1/bug-intel-parse.test.mjs).

This is a new version, not a part of the measured one. It has not been measured. The pipeline of version 2 stays in [pipeline/v2](../v2).

- bug-intel-runner.mjs SHA-256 `a32cd07a9a2ca0cb0b419d1c3ca755f7fc17168e3b52a0ec47cebc45967ce35f`
- bug-intel-scope.mjs SHA-256 `773266ce0b8d5e6e9802e490342624a35fbcfe388bd0098138aab72966f444bb`

Run the tests with: node --test pipeline/v2.1/bug-intel-scope.test.mjs pipeline/v2.1/bug-intel-parse.test.mjs
