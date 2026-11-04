#!/usr/bin/env node
// ranges-check.mjs: a published voided-answer count must have a range next to it, not just the count on its own (an outside reader
// should not have to guess what the real figures could be). Tom Smart found 56 voided answers across five older folders that results/README.md
// did not mention a range for (issue 41, 4 November 2026); this checks that every folder named in the "Voided open-judge answers" table with
// a count above zero is also named on its own line under "### Ranges if the voided answers are counted" in the same file.
// This covers the five older, frozen folders (24 October to 1 November), whose own README files are not edited after publication.
// It does not yet check a newer folder's own README for a range; those folders carry their own count in their own check.mjs output.
//
//   node tools/ranges-check.mjs      exit 0 when every published count has a range, 1 when one does not.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ANKER = '### Ranges if the voided answers are counted'

/** Finds every "| folder | N voided answers | ... |" row in the index and checks each one with N > 0 is named under ANKER. */
export function controleerBereiken(indexTekst) {
  const bereikStuk = (indexTekst.split(ANKER)[1] ?? '').split('\n## ')[0]
  const regels = bereikStuk.split('\n')
  const rij = /\|\s*(2026-\d\d-\d\d-[a-z0-9-]+)\s*\|\s*(\d+)\s*voided answers?\s*\|/g
  const uitkomst = []
  let m
  while ((m = rij.exec(indexTekst))) {
    const [, map, n] = m
    if (Number(n) === 0) continue
    uitkomst.push({ map, n: Number(n), bereikAanwezig: regels.some((r) => r.includes(map)) })
  }
  return uitkomst
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const index = readFileSync(join(root, 'results/README.md'), 'utf8')
  const r = controleerBereiken(index)
  let status = 0
  for (const x of r) {
    console.log(`${x.bereikAanwezig ? 'OK     ' : 'MISSING'} ${x.map}: ${x.n} voided answers, range ${x.bereikAanwezig ? 'present' : 'NOT found under "' + ANKER + '"'}`)
    if (!x.bereikAanwezig) status = 1
  }
  if (r.length === 0) console.log('no folder with a published voided count above zero found in results/README.md')
  process.exit(status)
}
