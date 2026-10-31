# Two runs of a development version on the sealed eight, 31 October 2026

Two runs of a development version of the scan, called lab here, on the 8 contests of the sealed set: 105 known findings, High and Medium, the same set as the sealed run of 24 October. Lab 1 is version 4.0 and lab 2 is version 4.1. Both runs ended on 31 October 2026. How the scan works stays private; the raw hypotheses and both judges' verdicts are in this folder. Each contest was run once per run.

## The result

Counted under the Two-Judge Strict Rule: a known finding counts only if both judges name it for the same hypothesis. The judges here are codestral and deepseek-flash.

| Run | Strict, first 15 | Strict, first 30 | Strict, whole list | One judge is enough, whole list | Hypotheses | Strict precision |
|---|---|---|---|---|---|---|
| lab 1, version 4.0 (partly read, see below) | 10 of 105 | 12 | 12 (11.4 percent) | 32 | 282 | 6.4 percent |
| lab 2, version 4.1 | 12 of 105 | 15 | 16 (15.2 percent) | 29 | 324 | 7.7 percent |
| For reference: version 3.1, 25 October, other judge pair | 8 of 105 | 8 | 8 | not reported | 120 | 7.5 percent |

Version 3.1 produced exactly 15 hypotheses per contest, 120 in all, so its first 15, first 30 and whole list are the same 8.

By how many participants found the finding (5 or more: easy, 3 or 4: middle, 1 or 2: hard):

| Run | Easy (59) | Middle (14) | Hard (32) |
|---|---|---|---|
| lab 1 | 12 | 0 | 0 |
| lab 2 | 16 | 0 | 0 |
| version 3.1 | 6 | 1 | 1 |

Both runs together found 21 different known findings strictly (20.0 percent), because they find partly different things. That is a union of two runs, not a number of a single scan.

The prediction for lab 2 was written down before the run: 12 to 25 strict, most likely 15 to 20 over the whole list. The whole list gave 16 (12 in the first 15, the number in the table headline). The rule written with it said that 17 or more over the whole list would count as clearly above lab 1, and 16 does not meet it. You have to take our word that the note came first.

## What went wrong in lab 1

In lab 1 most of the scan's work came back empty because of a setting of ours, so several contests were only partly read; one of them reached 78 percent of its code. Lab 2 started with the setting that worked and read every contest in full: 0.12 dollars for the whole set, 0.4 to 2.1 minutes per contest. The settings differ between the two runs, so they are not repeats of each other. Lab 1 is published because the Publication Rule says every run is.

## What these numbers are not

- One run each. Lab 2 is the better of the two. Between the two runs the version and a setting both changed, so the rise from 12 to 16 cannot be credited to either one.
- The judges changed. The earlier rows used gpt-oss-120b and deepseek; here it is codestral and deepseek-flash. The two pairs may count differently, so the version 3.1 row is not strictly comparable.
- We built this version after the answers to these 105 findings were public, and we built run 2 after seeing run 1 on the same findings, so treat the set as tuned on. Read the numbers as a development result.
- The 8 contests have been public since 24 October and may be in the training data of the models behind the scan and the judges.
- All findings the scan got right are easy ones. Not one middle or hard finding was found in either run.
- Both judges are automated and can be wrong in the same direction; their verdicts for every hypothesis are in judge/.

Judge answers that could not be read: 0 of 1212 (a verdict without a match field counts as unreadable).

## Files

- table-lab-1.json and table-lab-2.json: one row per contest.
- raw/: the hypotheses per contest and run, in the ranked order of the scan, with title, severity, file, function, description, attack path, impact and recommendation. Other fields of the scan are not published.
- judge/: the verdict of both judges for every hypothesis.
- totals.json: the sums above.
- check.mjs: recomputes the strict and one-judge counts per contest and the union of 21 from judge/ and compares them with the tables. Run node check.mjs. It needs no network and no key. Precision (hypotheses with a strict hit divided by all hypotheses: 18 of 282 and 25 of 324) is counted from the same files by hand and is not part of the script. The easy, middle and hard split comes from the participant counts in the folder results/2026-10-24-sealed of this repository and is not recomputed here.
- SHA256SUMS: hashes of all files.
