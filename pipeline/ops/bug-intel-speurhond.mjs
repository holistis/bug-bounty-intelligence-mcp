#!/usr/bin/env node
/**
 * Speurhond: draait een statische analyser (Slither, later Aderyn) op een Solidity-project en zet de uitkomst om naar
 * dezelfde vorm als een scan-bevinding. De uitkomst gaat als APART GELABELDE context naar het model ("bevestig of verwerp"),
 * nooit als een eigen bevinding van de scan, zodat je later nog kunt zien of de winst van het model komt of van de speurhond.
 *
 *   node scripts/bug-intel-speurhond.mjs <projectmap> [--tool slither|aderyn|beide] [--uit pad.json]
 *
 * Niet aangesloten op de runner (die is bevroren). Draai dit alleen op code die je vertrouwt of in een wegwerp-sandbox:
 * compileren van andermans project kan scripts van dat project uitvoeren.
 *
 * Status per tool: ok | niet-beschikbaar | niet-compileerbaar. Slither is getest tegen echte uitvoer (zie test).
 * Aderyn: het uitvoerformaat is uit de documentatie overgenomen en NIET getest tegen echte uitvoer, want Aderyn draait niet op Windows.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SEV = { High: 'High', Medium: 'Medium', Low: 'Low', Informational: 'Info', Optimization: 'Info' }
const CONF = { High: 0.9, Medium: 0.6, Low: 0.3 }

/** Slither --json uitvoer naar bevindingen. Dependencies (lib/, node_modules) worden weggelaten. */
export function parseSlither(json) {
  const uit = []
  for (const d of json?.results?.detectors ?? []) {
    const els = (d.elements ?? []).filter(e => e?.source_mapping && !e.source_mapping.is_dependency)
    if (els.length === 0) continue
    const fn = els.find(e => e.type === 'function')
    const bestand = els[0].source_mapping.filename_relative
    const regels = [...new Set(els.flatMap(e => e.source_mapping.lines ?? []))].sort((a, b) => a - b)
    uit.push({
      tool: 'slither', check: d.check, severity: SEV[d.impact] ?? 'Info', confidence: CONF[d.confidence] ?? 0.3,
      file: bestand, function: fn ? fn.name : '', contract: fn?.type_specific_fields?.parent?.name ?? els[0].type_specific_fields?.parent?.name ?? '',
      lines: regels.slice(0, 40), title: d.check, description: String(d.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    })
  }
  return uit
}

/** Aderyn report.json naar bevindingen (formaat uit de documentatie, ongetest tegen echte uitvoer). */
export function parseAderyn(json) {
  const uit = []
  for (const [sleutel, sev] of [['critical_issues', 'Critical'], ['high_issues', 'High'], ['medium_issues', 'Medium'], ['low_issues', 'Low']]) {
    for (const issue of json?.[sleutel]?.issues ?? []) {
      for (const inst of issue.instances ?? []) {
        if (/(^|\/)(lib|node_modules|test|tests|script|scripts|mock|mocks)\//i.test(String(inst.contract_path ?? ''))) continue
        uit.push({
          tool: 'aderyn', check: issue.detector_name ?? issue.title, severity: sev, confidence: 0.5,
          file: inst.contract_path ?? '', function: '', contract: '', lines: inst.line_no ? [inst.line_no] : [],
          title: issue.title, description: String(issue.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
        })
      }
    }
  }
  return uit
}

/** Het blok dat in de prompt komt: duidelijk gelabeld als context van een speurhond, niet als bevinding van het model. */
export function maakContextBlok(bevindingen, { max = 20 } = {}) {
  const rang = { Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0 }
  const lijst = [...bevindingen].filter(b => b.severity !== 'Info').sort((a, b) => rang[b.severity] - rang[a.severity] || b.confidence - a.confidence).slice(0, max)
  if (lijst.length === 0) return ''
  return 'STATIC ANALYSIS CONTEXT (from an automated tool, not from you). For each item, decide from the code whether it is a real, reachable issue. ' +
    'Do not repeat an item as your own finding unless you can name the concrete attack path.\n' +
    lijst.map(b => `- [${b.tool}/${b.severity}] ${b.check} in ${b.file}${b.function ? ' ' + b.function + '()' : ''}${b.lines.length ? ' lines ' + b.lines.slice(0, 3).join(',') : ''}: ${b.description.slice(0, 160)}`).join('\n')
}

function draai(map, tool) {
  if (tool === 'slither') {
    const uit = join(mkdtempSync(join(tmpdir(), 'speur-')), 'slither.json')
    const r = spawnSync('slither', [map, '--json', uit, '--exclude-dependencies'], { encoding: 'utf8', timeout: 300_000 })
    if (r.error) return { status: 'niet-beschikbaar', reden: String(r.error.message).slice(0, 120), bevindingen: [] }
    if (!existsSync(uit)) return { status: 'niet-compileerbaar', reden: String(r.stderr ?? '').split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300), bevindingen: [] }
    const j = JSON.parse(readFileSync(uit, 'utf8'))
    if (j.success === false) return { status: 'niet-compileerbaar', reden: String(j.error ?? '').slice(0, 300), bevindingen: [] }
    return { status: 'ok', bevindingen: parseSlither(j) }
  }
  if (tool === 'aderyn') {
    const uit = join(mkdtempSync(join(tmpdir(), 'speur-')), 'aderyn.json')
    const r = spawnSync('aderyn', [map, '-o', uit], { encoding: 'utf8', timeout: 300_000 })
    if (r.error) return { status: 'niet-beschikbaar', reden: String(r.error.message).slice(0, 120), bevindingen: [] }
    if (!existsSync(uit)) return { status: 'niet-compileerbaar', reden: String(r.stderr ?? '').slice(-200), bevindingen: [] }
    return { status: 'ok', bevindingen: parseAderyn(JSON.parse(readFileSync(uit, 'utf8'))) }
  }
  return { status: 'niet-beschikbaar', reden: 'onbekende tool', bevindingen: [] }
}

if (process.argv[1] && process.argv[1].endsWith('bug-intel-speurhond.mjs')) {
  const map = process.argv[2]
  if (!map) { console.error('gebruik: <projectmap> [--tool slither|aderyn|beide] [--uit pad.json]'); process.exit(2) }
  const ti = process.argv.indexOf('--tool'), tool = ti > 0 ? process.argv[ti + 1] : 'slither'
  const tools = tool === 'beide' ? ['slither', 'aderyn'] : [tool]
  const resultaat = {}
  for (const t of tools) resultaat[t] = draai(map, t)
  const alle = Object.values(resultaat).flatMap(r => r.bevindingen)
  for (const [t, r] of Object.entries(resultaat)) console.log(`${t}: ${r.status}${r.reden ? ' (' + r.reden + ')' : ''}, ${r.bevindingen.length} bevinding(en)`)
  const ui = process.argv.indexOf('--uit')
  if (ui > 0) writeFileSync(process.argv[ui + 1], JSON.stringify({ resultaat, bevindingen: alle }, null, 1))
  else console.log(maakContextBlok(alle))
}
