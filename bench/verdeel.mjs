#!/usr/bin/env node
/**
 * Verdeelt de geschikte wedstrijden over een ontwikkelset en een verzegelde set, met een zaad dat niemand van ons kan kiezen:
 * de hash van een Base-blok die op het moment van vastleggen het nieuwste was.
 *
 *   node verdeel.mjs contests.json <blokhash> <aantalOntwikkel> <aantalVerzegeld> <uitmap>
 *
 * Geschikt = bronrepo bestaat, de precheck is ok, hoogstens 500 KB eigen Solidity, en minstens 3 unieke geldige H/M-bevindingen.
 * Volgorde = oplopend op sha256(zaad + wedstrijdnaam). De eerste n gaan naar de ontwikkelset, de volgende m naar de verzegelde set.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const [, , bestand, zaad, nDev, nZeg, uit] = process.argv
const reg = JSON.parse(readFileSync(bestand, 'utf8')).contests
const sha = (s) => createHash('sha256').update(s).digest('hex')

export const geschikt = (c) => c.sourceBestaat && c.precheck === 'ok' && c.inScopeKb <= 500 && (c.high + c.medium) >= 3
const kand = reg.filter(geschikt).sort((a, b) => sha(zaad + a.contest).localeCompare(sha(zaad + b.contest)))
const dev = kand.slice(0, Number(nDev))
const zeg = kand.slice(Number(nDev), Number(nDev) + Number(nZeg))
const rest = kand.slice(Number(nDev) + Number(nZeg))
const kort = (c) => ({ contest: c.contest, sourceRepo: c.sourceRepo, inScopeKb: c.inScopeKb, inScopeFiles: c.inScopeFiles, issues: c.issues.map(i => ({ id: i.id, severity: i.severity, title: i.title, finders: i.finders, files: i.files, excerpt: i.excerpt })) })
const kanon = (lijst) => JSON.stringify(lijst.map(c => ({ contest: c.contest, issues: c.issues.map(i => ({ id: i.id, title: i.title, finders: i.finders })) })))

mkdirSync(uit, { recursive: true })
writeFileSync(join(uit, 'ontwikkelset.json'), JSON.stringify({ zaad, contests: dev.map(kort) }, null, 1))
writeFileSync(join(uit, 'verzegelde-set.PRIVE.json'), JSON.stringify({ zaad, contests: zeg.map(kort) }, null, 1))
const verklaring = {
  zaad_basisblok_hash: zaad,
  geschikt: kand.length, ontwikkel: dev.length, verzegeld: zeg.length, reserve: rest.length,
  ontwikkelset: dev.map(c => ({ contest: c.contest, bevindingen: c.issues.length, inScopeKb: c.inScopeKb })),
  verzegelde_set_aantal_bevindingen: zeg.reduce((a, c) => a + c.issues.length, 0),
  verzegelde_set_sha256: sha(kanon(zeg)),
  ontwikkelset_sha256: sha(kanon(dev)),
  reserve_namen_niet_gebruikt: rest.map(c => c.contest),
}
writeFileSync(join(uit, 'verklaring.json'), JSON.stringify(verklaring, null, 1))
console.log(JSON.stringify(verklaring, null, 1))
