# Operations: the learning loop around the scan

These scripts run on the server next to the scan (the scripts folder of the server). They are published so that the way the scan learns can be checked as well as the scan itself. None of them changes the scan code. They handle the prompt hints of the scan (data/bug-intel-patterns.json) and the labels that feed those hints.

- bug-intel-learner.mjs: turns the job log and the labels into hints. It counts only jobs with a real payment and writes only a candidate file (data/bug-intel-patterns.candidate.json), never the live one.
- bug-intel-benchmark.mjs: the evidence gate. A candidate may go live only if the new hints rest on enough labelled findings and no warning disappears without new evidence. It does not measure whether the scan improves. The contest benchmark does that.
- bug-intel-patterns-beheer.mjs: list, snapshot, diff, promote and roll back the live hints. Every action is logged, and promote runs the gate first.
- bug-intel-label-sync.mjs: a finding that carries scan_job_id and scan_finding_id and has an outcome becomes a label, without anyone typing it.
- bug-intel-speurhond.mjs: runs Slither (and later Aderyn) and turns the output into labelled context for the model. Slither is tested against real output. The Aderyn format is taken from its documentation and is not tested against real output, because Aderyn does not run on Windows.

Run the tests with: node --test pipeline/ops/*.test.mjs
