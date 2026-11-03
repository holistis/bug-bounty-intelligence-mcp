# Contributing

This repository holds our evidence: result folders, the scripts that recount them, and the tools to plant faults and re-judge. It is MIT licensed. The scan engine itself, with its prompts, models and settings, is not in this repository and is not open source.

## What you can do

The open checks are listed at the end of results/README.md. Pick one, say so in issue 41 (or open an issue of your own), and do it. Other useful things:

- Recount a folder on your own machine and tell us what you got.
- Plant a fault in a copy of a folder and see whether its check.mjs notices. A checker that accepts a planted fault is a bug.
- Tell us a number that is wrong.

## How a change is reviewed

- Only the maintainer has write access. Workflows on pull requests from outside run read-only and without secrets.
- Every pull request is read line by line before it is merged.
- A change to a check.mjs is also tested on a copy with a planted fault, and we recompute its hash list.
- A change to a published number is only accepted with a recount from the folder's own files.
- Keep a pull request to one folder and one purpose.

## Credit

Your commits keep your authorship. When you check a folder, your name goes into the README of that folder, with what you checked and what you did not check.

## Errors

If you find an error in a published number, open an issue. We correct it in public, in the folder and in ERRATA.md, and we name who found it.

## What stays closed

The scan engine, its prompts, models and settings. What we publish is the evidence you need to check the result.

Cite as: tokenizen (github.com/holistis).
