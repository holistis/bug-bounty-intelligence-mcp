# Pipeline v2: the files that run the paid scan

These are copies of the files that run in production after the change described in [PREREGISTRATION-v2-2026-10-24.md](../../PREREGISTRATION-v2-2026-10-24.md). Their SHA-256 values are in that file, so you can check that what you read here is what was frozen before the measurement.

- bug-intel-runner.mjs: the job runner (clone, scope, parts, hunt, report).
- bug-intel-scope.mjs: which files count, which submodules may be fetched, in what order and in what parts the code goes to the model. Pure functions, no network.
- bug-intel-scope.test.mjs: unit tests for the scope rules (`node --test pipeline/v2/bug-intel-scope.test.mjs`).
- DIFF-production-vs-test-copy.txt: the one difference between the production runner and the copy used for the measurement. The copy writes the report to a local folder instead of posting it to the live server.

The runner reads its model keys from the environment of the server. No key is in these files.
