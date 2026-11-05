# tools

Checks of our own checks. Each file says what it does in its first lines, and each claim here has a test.

| File | What it does |
|---|---|
| checker-selftest.mjs | Plants ten kinds of fault in a copy of every result folder that has a check.mjs and prints CAUGHT, BLIND, N/A or NOT MEASURABLE per fault. A folder counts as catching a fault when its check.mjs or verify-manifests.mjs fails. Exit 1 when anything is blind or cannot be measured. |
| verify-manifests.mjs | Checks that the SHA256SUMS of every result folder names every file in that folder, that no line is for a file that is gone, that no file is listed twice, and that a nested list is named by its parent. results/ itself is covered: a loose file or a symbolic link there fails. |
| manifest-policy.json | The known gaps of the folders published before the verifier existed, by name. Only folders dated before 5 November 2026 can be named, the file may only shrink, and an entry that is no longer true fails the run. |
| ranges-check.mjs | A published count of voided answers must have a range next to it. |

## The faults and who found them

| Fault | What it does | Found by |
|---|---|---|
| made-up id | a finding id that does not exist | Darja Rihla, pull request 74 |
| flipped verdict | a verdict of the grader copy turned around | us |
| empty hash list | SHA256SUMS emptied | us |
| cut-off file | a verdict file cut short | us |
| missing file | a file deleted, its line removed | us |
| duplicate row | the same finding counted twice | us |
| missing hash entry | one line removed from a non-empty list, the file kept | Darja Rihla, issue 103 and pull request 104 |
| unlisted file | a file added that no list names | us, after her omission |
| dangling entry | a line for a file that is not there | us, after her omission |
| swapped names | two lines trade their file names and keep their hashes | us, after her omission |

## What this does not catch

- A file and its line removed together, or both rewritten. A hash list inside the same folder cannot see that; it needs an anchor outside the folder, such as git history or a timestamp.
- Anything the policy names: nine files in five folders and three folders without a list, listed in manifest-policy.json. results/README.md, the index, is not named in any list either.
- A text file whose line endings were changed from CRLF to LF or back. It is reported as a note, because the checkers in the result folders hash text that way too.

The story of the omission is in [ERRATA.md](../ERRATA.md), 5 November 2026.
