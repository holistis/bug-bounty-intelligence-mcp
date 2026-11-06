#!/usr/bin/env node
// judge-disagreement-check.mjs: a strict score (both judges agree) can hide a real match that
// one judge found and the other missed, counting it as "unmatched" the same as a candidate
// neither judge recognized at all. Found 5 Nov 2026 on 2024-12-secondswap, item 5 (judge a:
// "H-03", judge b: null) and item 9 (judge a: "H-01", judge b: null): both land in the
// "unmatched" bucket of the published strict score, but a real match was found by one judge.
// An outside reviewer's independent, manual, Foundry-tested classification (issue 102,
// bug-bounty-intelligence-mcp, 5 Nov 2026) separately named H-01/H-02/H-03 for exactly these
// items, a second, unrelated method landing on the same answer.
//
// This does NOT change the published strict count (requiring both judges to agree is a
// deliberate, conservative choice, kept as-is). It makes the split inside "unmatched" visible
// by default, for every audit, so this kind of hidden match does not need a human to notice it
// by hand again.
//
//   node tools/judge-disagreement-check.mjs                          every hypothesis-verdicts file found under results/
//   node tools/judge-disagreement-check.mjs <path-to-one-file.json>  one file only
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Splits one hypothesis-verdicts file's candidates into three buckets.
 * @param {Array<{strict?: string|null, a?: {match?: string|null}, b?: {match?: string|null}}>} verdicts
 */
export function telVerdictBuckets(verdicts) {
  let strict = 0
  let disagreementMetEchteTreffer = 0
  let geenEnkeleRechter = 0
  for (const v of verdicts ?? []) {
    if (v?.strict) {
      strict++
      continue
    }
    const a = v?.a?.match
    const b = v?.b?.match
    if (a || b) disagreementMetEchteTreffer++
    else geenEnkeleRechter++
  }
  return { totaal: (verdicts ?? []).length, strict, disagreementMetEchteTreffer, geenEnkeleRechter }
}

/** Reads one verdict file (an array, or an object with a `verdicts` array). */
export function leesVerdictBestand(pad) {
  const j = JSON.parse(readFileSync(pad, 'utf8'))
  return Array.isArray(j) ? j : (j.verdicts ?? Object.values(j)[0] ?? [])
}

function vindVerdictBestanden(root) {
  const gevonden = []
  const stapel = [root]
  while (stapel.length) {
    const map = stapel.pop()
    for (const naam of readdirSync(map)) {
      const pad = join(map, naam)
      const info = statSync(pad)
      if (info.isDirectory()) {
        if (naam === 'node_modules') continue
        stapel.push(pad)
      } else if (info.isFile() && naam.endsWith('.json') && pad.replace(/\\/g, '/').includes('/hypothesis-verdicts/')) {
        gevonden.push(pad)
      }
    }
  }
  return gevonden.sort()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const enkelBestand = process.argv[2]
  const bestanden = enkelBestand ? [enkelBestand] : vindVerdictBestanden(join(root, 'results'))

  if (bestanden.length === 0) {
    console.log('no hypothesis-verdicts/*.json file found under results/')
    process.exit(0)
  }

  let totStrict = 0, totDisagreement = 0, totGeen = 0, totAantal = 0
  for (const pad of bestanden) {
    const c = telVerdictBuckets(leesVerdictBestand(pad))
    totStrict += c.strict
    totDisagreement += c.disagreementMetEchteTreffer
    totGeen += c.geenEnkeleRechter
    totAantal += c.totaal
    const naam = pad.replace(/\\/g, '/').split('/results/')[1] ?? pad
    const vlag = c.disagreementMetEchteTreffer > 0 ? '  <- check this' : ''
    console.log(`${naam}: ${c.totaal} candidates, strict ${c.strict}, judge-disagreement-with-a-real-match ${c.disagreementMetEchteTreffer}, no judge found anything ${c.geenEnkeleRechter}${vlag}`)
  }
  console.log('')
  console.log(`TOTAL across ${bestanden.length} file(s): ${totAantal} candidates, strict ${totStrict}, judge-disagreement-with-a-real-match ${totDisagreement}, no judge found anything ${totGeen}`)
  if (totDisagreement > 0) {
    console.log(`${totDisagreement} candidate(s) are counted as "unmatched" in the strict score, but at least one judge did find a real known finding for them. The strict count itself is unchanged (both judges agreeing is a deliberate, conservative definition); this number is a visible, separate footnote.`)
  }
}
