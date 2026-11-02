# The current setup against bugs inserted today, 2 November 2026

The earlier folders measure our scan on audits that older versions of it had seen. This folder tests something else: faults that did not exist this morning. With a script and a fixed seed we inserted 12 faults into contract code of three public projects, ran the scan on each copy, and ran it on a clean copy of each project as a control. The inserted faults cannot be in the training data of any model, because they were made today. The rest of the code can be, and the model may recall the original code and its comments.

## The three projects

- sherlock-audit/2026-07-tare at abdf2a8e0c
- code-423n4/2026-04-monetrix at 3d94be1361
- code-423n4/2026-03-intuition at 314b7d4d9c

2026-04-monetrix was also in our earlier out-of-scope baseline of 24 October (results/2026-10-24-baseline). Our plan had a different third project, a Sherlock contest repository. We found that it is private, so none of its code or results is in this folder, and we replaced it with 2026-03-intuition. That replacement was made after the runs on the other two projects, for that reason and not because of their results.

## How the faults are made

mutate.mjs (in this folder) picks, with seed 2026-11-02, four places per project and changes the code: it removes an access control modifier (onlyX) from an external function (6 times in total), removes a one-line check, a require or an if-revert (3 times), or shifts a comparison by one, >= becoming > or <= becoming < (3 times). It leaves comments in place, and one of the faults the scan found was spotted through a comment. The projects and their versions are in sources.json, and the folder you clone into must be named exactly like the repository, for example 2026-07-tare, because the seed uses the folder name. mutations/ lists each inserted fault with file, line, the code before and after, and sources.json holds the SHA-256 of every picked file before and after the change, in the form mutate.mjs writes it: the file with its line endings converted to LF. The picked files make up 1147 to 1176 lines per project. The copies hold only the picked files, and two projects' files were flattened (see below).

These are inserted faults, not proven vulnerabilities. A shifted comparison can make a check stricter and a removed check on an admin function may change little. The ones that matter most are the removed access controls.

## Result

12 inserted faults. Found, by our re-creation of the EVMbench detect grader (the grader copy: gpt-5, high reasoning effort, one call per fault): 8 of 12. Found, strictly, by the two open judges (gpt-oss-120b and deepseek-v4-flash, both naming the same fault): 7 of 12 (58.3 percent), and 8 of 12 when either counts. The grader copy credits more than the open judges here. It was not run on the clean copies, so its number has no control of its own. Scan cost 1.7 dollars for the six counted runs.

| Project | Lines in scope | Inserted faults | Found, grader copy | Found, open judges strict | Hypotheses | Scan cost (USD) |
|---|---|---|---|---|---|---|
| tare | 1147 | 4 | 3 | 2 | 10 | 0.24 |
| monetrix | 1176 | 4 | 2 | 2 | 9 | 0.31 |
| intuition | 1164 | 4 | 3 | 3 | 6 | 0.27 |

## By kind of fault

| Kind | Inserted | Found, grader copy | Found, open judges strict |
|---|---|---|---|
| Removed access control (onlyX) | 6 | 6 | 5 |
| Removed check (require or if-revert) | 3 | 2 | 2 |
| Shifted comparison (off by one) | 3 | 0 | 0 |

## The controls

On the clean copies the scan wrote 21 hypotheses. The open judges were asked, as for the other runs, whether any of them matches one of the four faults of that project, which are not in the clean code, so a match would be a false match by the judges: 0 strict, 0 with either judge.

| Project | Lines in scope | Hypotheses | Strict matches | Matches with either judge | Scan cost (USD) |
|---|---|---|---|---|---|
| tare | 1147 | 8 | 0 | 0 | 0.28 |
| monetrix | 1176 | 7 | 0 | 0 | 0.33 |
| intuition | 1164 | 6 | 0 | 0 | 0.27 |

## Precision

On the three runs with faults, 7 of 25 hypotheses match an inserted fault strictly (28.0 percent). A hypothesis about a real problem of the original code counts as a miss here, so this is a floor. The slice we fixed in advance, the first five hypotheses per run: 7 of 15 (46.7 percent). Hypotheses with confidence above 0.5, a slice we did not fix in advance: 7 of 8. 1 of the 92 open-judge answers named an id that the reading rule voids (for example H-4 instead of H-04); they count as no match and we did not recount them, which can only lower our numbers.

## A bug in the scan that this test found

The first attempts on 2026-07-tare read none of the files and wrote no hypotheses: five runs, clean control included (failed-attempts.json lists them). Four more empty runs happened on the private project we left out. A scan of one pass, which small projects get, was given no list of the files and had to find them itself. Glob is not available in this setup, and on these projects the model never found the files. Earlier one-pass runs on other projects did find theirs (the three tempo audits, 2025-05-yearn-ybold and the monetrix copies), so this is not a fixed rule, and we have not found out why it failed every time on these. We added the list of in-scope files to the prompt of a one-pass scan, as the prompt of a pass in a longer scan already had. After that the scans of tare and of the replacement project read all of their files. Scans of more than one pass are unchanged. The fix is deployed on the shop's scan server. The shop's order file holds three orders for a 410-line repository, made on 1 November while we were testing the shop, that failed with the message "agent gaf een fout"; this looks like the same failure, and we have not checked each one.

Only the runs after the fix are counted for tare, and the replacement project ran after the fix. Counting only later runs could look like picking the good ones, so the empty runs are listed with their cost. The monetrix runs used the earlier prompt, because they had worked and were not rerun. The counted runs therefore come from two versions of the prompt. Because tare keeps its files in deeply nested folders, mutate.mjs was run with --flat for it, which puts each picked file at src/<name>.sol. That choice, the prompt fix and the replacement project were all made after we saw empty runs.

## The rule, what we guessed, and what changed

We wrote down the rule and the guess before the scans, in a local note nobody else can see, so you cannot check when; it was first committed to our private repository only after the first empty runs. The rule: it holds if at least 5 of the 12 faults are found strictly with the open judges, the three controls together have at most 1 strict match, and at least 15 percent of the first five hypotheses match. It does not hold at 2 or fewer found, 3 or more control matches, or less than 10 percent in the first five. Between those it is undecided. Our guess was 6 of 12 found strictly (range 3 to 9), 6 found by the grader copy (range 3 to 9), at most 1 control match, and 25 percent in the first five (range 10 to 40). By the rule this holds. Counting the empty first attempts as zero, the first attempt would have found 2 of the 8 faults of tare and monetrix, which counts against us.

## What this does and does not say

- It shows that the scan finds inserted faults of three simple kinds that cannot have been in its training data. It does not show that it finds new kinds of bugs, or real contest bugs.
- A scan that notices every missing check can score high here. 12 faults is few: one moves the result by 8.3 points.
- The code around the faults can be in the training data, the model may recall it, and the nested layout of tare is untested after the fix.
- We position the scan as an affordable, experimental second check next to a human audit, and not as a replacement for one. This test does not change that.
- The model, prompts and settings of the scan are not published. The outputs, the judges and the counting are.
- Nobody outside our team has repeated this yet.

## Do it yourself

Three ways, from cheap to thorough:

1. Recount: node check.mjs recomputes every count in table.json from the verdict files and checks the hashes. No network and no key. It does not check cost or lines, and not whether the judges' verdicts are right.
2. Re-judge with your own model: node rejudge.mjs --base-url <an OpenAI-compatible endpoint> --model <your model> --key-env <name of the environment variable that holds your key> asks your model the same question for every hypothesis (46 calls for the whole folder) and prints how many faults it finds and how often it agrees with our judges. A failed call is counted as an error and the script exits with an error.
3. Rebuild the test and run your own scanner: clone the three repositories at the commits in sources.json into folders named like the repositories, run mutate.mjs with the arguments in sources.json, and run your tool on the mut and ctl copies. mutations/ is the answer key, and the script is deterministic, so you get the same faults.

If a number does not match, please say so in issue 41 of this repository and we will correct it and keep the old text visible.

Cite as: tokenizen (github.com/holistis), results/2026-11-02-injected-bugs-test in holistis/bug-bounty-intelligence-mcp, 2 November 2026.
