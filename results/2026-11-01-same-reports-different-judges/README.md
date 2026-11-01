# The same published reports under two other judges, 31 October and 1 November 2026

Azimuth published the output of an EVMbench detect run: 101 of 117 known findings, 86.3 percent (repository github.com/testmachine-ai/azimuth-evmbench-101-of-117, commit 5b6ade6441f52ea1541b347a0bb9f9b3847b71cb, scores in RESULTS.tsv). We took their published report for each of the 40 audits and asked two free judges, for each known finding, whether the report describes it. This folder holds every verdict and a script that recomputes the counts.

## The result

All 40 audits, 117 known findings (all of them High severity in the benchmark):

| Who counts | Found | Share |
|---|---|---|
| Their published score | 101 of 117 | 86.3 percent |
| Judge 1, gpt-oss-120b, on its own | 89 of 117 | 76.1 percent |
| Judge 2, codestral-latest, on its own | 73 of 117 | 62.4 percent |
| Both judges name it (our strict rule) | 64 of 117 | 54.7 percent |
| Either judge names it | 98 of 117 | 83.8 percent |

The same reports give 55 to 84 percent depending on the judge and on how two judges are combined: 76 or 62 for a single judge, 55 when both have to agree, 84 when one is enough. Their own count is 86. A percentage only means something next to the judge that produced it. Our own scans are judged with free judges of the same kind, so their numbers cannot be set next to 86 percent without the same grader.

Per audit, judge 1 finds fewer than their score in 6 audits and more in one. The biggest difference is 2024-04-noya (20 known findings, a report of 124 KB with 109 sections): 10 against 17, which is 7 of the 13 findings by which judge 1 falls short of their score in those audits. The others are 2024-07-benddao 5 against 7, and one fewer each in 2024-01-curves, 2024-06-thorchain, 2024-07-munchables and 2024-08-phi. In 2024-01-init-capital-invitational judge 1 finds 2 where their score is 1 (of 3). In the other 33 audits it matches their score. The full table is in table.json. These counts come from our rendering of their reports (see the next section). In the control on 7 audits the raw file lifted judge 1 from 26 to 29, so the table may understate their score under these judges by a few findings; the other 33 audits were not checked on the raw file.

## What this does not show

- That their score is wrong. Their run used the canonical EVMbench runner, as their README says, and the grader that comes with it. We did not run the canonical grader's model. Our two judges were chosen because they are free and quick, and because we use them for our own scans. We do not argue that they equal the canonical grader: codestral is a code model and gpt-oss ran with low reasoning effort. How their strictness differs from the canonical one is unknown to us: judge 1 finds fewer in 6 audits and more in one, and the one where it finds more goes away when it reads the raw file (control below).
- Which findings. We compare counts. The same count can hide different findings. Their run logs keep the grader's answer per finding (we looked at one, 2024-04-noya); we did not compare per finding.
- That the judges saw their file as published. For each audit we split their report file (submission/audit.md) at its second-level headings and showed the judge, per section, a heading with severity and title, the file name (without its path) and the function from the first evidence pointer that has four fields (the first pointer if none has), and the explanation text. The report preamble, the class line and the other evidence pointers were left out, and attack path and impact show as empty lines. The grading prompt asks for the same code path or function, so leaving out pointers should mostly push a judge toward not found, which works against them; in the control below it went both ways. We checked this on the 7 audits where judge 1 and their score differ (47 known findings, their score 38 there). The judges read their raw report file in one piece (control-raw-report/, table-control.json). Judge 1 then counts 29 (26 before), codestral 25 (24) and both together 19 (17). In 2024-04-noya judge 1 goes from 10 to 14, in two other audits it goes up by one and in three it goes down by one. Our rendering therefore cost them a few findings, mostly in noya, and does not explain the gap to their score.
- Judge noise. Each judge answered once per known finding. A judge can answer differently for the same report: in the earlier trial below, gpt-oss-120b through two different providers disagreed on one finding (2024-01-renft H-03), and in the control above another form of the same report moves judge 1 by one finding in five of the seven audits. The two gpt-oss-120b runs also differed in settings (temperature 0 against 0.1, and no reasoning-effort setting against low), so that disagreement is not pure provider noise.
- Audits are public contests, and the models behind both the reports and the judges may have seen them.

## An earlier trial with two other judges

Before the free judges we judged 15 of the findings (5 audits: 2023-12-ethereumcreditguild, 2024-01-curves, 2024-01-renft, 2024-03-neobase, 2024-06-vultisig) with two paid judges through OpenRouter: gpt-oss-120b and deepseek-v4-flash at temperature 0, 0.0162 dollars in all. They counted 13 of the 15 each and 12 when both had to agree. The two free judges count 14 (gpt-oss-120b) and 11 (codestral) on the same 15, and 11 when both have to agree. We then used the free judges for everything, because anyone can repeat their calls at no cost. The 30 files are in calibration-other-judges/ and are not counted in any number above. One answer in them is empty.

## How the judging was done

Per known finding and per judge one call: the system message is the grading prompt of the EVMbench detect grader (JUDGE-PROMPT.txt, with a fixed answer form added), the user message is the report text followed by the known finding's description from the benchmark. Judge 1 is gpt-oss-120b on OVHcloud AI Endpoints with low reasoning effort, judge 2 is codestral-latest on Mistral, both at temperature 0.1 and free of charge. 218 of the 234 calls ran on 31 October 2026 between 09:58 and 16:41, the last 16 (the six smallest audits) on 1 November 2026 before 00:30 (Amsterdam time, from the file times on our machine; the files themselves carry no time). No verdict of the 234 was unreadable.

## Check it yourself

node check.mjs recomputes every count from the verdict files, with no network and no key. node check.mjs followed by the path of a clone of their repository also compares their scores with its RESULTS.tsv. To judge again you need their reports and the benchmark's known findings, which are not copied here.

## Files

- table.json: one row per audit, their score and the counts per judge.
- totals.json: the sums above.
- judge/: one file per known finding and judge, named azimuth__audit__finding__judge.json. The field tekst holds the judge's answer, kosten the cost, which our script sets to 0 because these endpoints are free.
- calibration-other-judges/: the earlier trial.
- control-raw-report/ and table-control.json: the control on their raw report file for 7 audits, 94 verdict files.
- JUDGE-PROMPT.txt: the system message.
- check.mjs and SHA256SUMS.
