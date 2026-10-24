/**
 * Gratis precheck voor Bug Bounty Intelligence: bestaat de repo, staat er Solidity in die
 * de scan meetelt, en hoeveel daarvan komt waarschijnlijk in beeld.
 *
 * Zonder LLM en zonder GitHub-API (die heeft een lage anonieme limiet): een gedeeltelijke
 * kloon zonder bestandsinhoud (--filter=blob:none --no-checkout) levert de bestandslijst
 * met groottes via `git ls-tree`. De inhoud van .gitmodules komt van de klant en wordt als
 * onvertrouwd behandeld (zie bug-intel-scope.mjs).
 *
 * De 4 checks: invoer is een strikt owner/repo-patroon en gaat alleen naar github.com;
 * er is een limiet per IP, een cache en een plafond op gelijktijdige controles; fouten
 * geven nooit paden of stderr terug.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyPath, parseGitmodules, submoduleToegestaan } from './bug-intel-scope.mjs'

export const MAX_CHUNKS = 6
export const CHUNK_CHARS = 20_000

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/
const CACHE_MS = 10 * 60 * 1000
const MAX_PARALLEL = 2
const cache = new Map()
const perIp = new Map()
let bezig = 0

/** "owner/repo", "https://github.com/owner/repo(.git)(/...)" -> "owner/repo", anders null. */
export function normaliseerRepo(invoer) {
  const s = String(invoer ?? '').trim()
  const m = s.match(/^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/)
  if (!m) return null
  const repo = `${m[1]}/${m[2]}`
  if (!REPO_RE.test(repo) || m[1] === '.' || m[1] === '..' || m[2] === '.' || m[2] === '..') return null
  if (m[1].startsWith('-') || m[2].startsWith('-')) return null   // GitHub kent geen gebruiker met een streepje voorop
  return repo
}

/** Per IP hoogstens `max` controles per venster. Geeft true als deze mag. */
export function ipMag(ip, nu = Date.now(), max = 8, venster = 60_000) {
  if (perIp.size > 5000) for (const [k, v] of perIp) if (nu - v[v.length - 1] > venster) perIp.delete(k)
  const lijst = (perIp.get(ip) ?? []).filter(t => nu - t < venster)
  if (lijst.length >= max) { perIp.set(ip, lijst); return false }
  lijst.push(nu)
  perIp.set(ip, lijst)
  return true
}

function gitLoop(args, { cwd, timeout = 30_000, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    execFile('git', ['-c', 'protocol.file.allow=never', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd, timeout, maxBuffer, encoding: 'utf8',
      // GIT_NO_LAZY_FETCH: een bestand dat de grens van de kloon overschrijdt wordt niet alsnog apart opgehaald.
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/root', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'https', GIT_NO_LAZY_FETCH: '1', LANG: 'C' },
    }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: stdout ?? '', stderr: stderr ?? '' }))
  })
}

/** Zuivere analyse van `git ls-tree -r -l` uitvoer. Apart zodat het zonder netwerk te testen is. */
export function analyseerBoom(lsTree, gitmodulesTekst = '') {
  const skipped = {}
  let solTotaal = 0, inScope = 0, inScopeBytes = 0, gitmodulesBlob = false
  const gitlinks = []
  let regels = 0
  for (const regel of String(lsTree).split('\n')) {
    if (!regel) continue
    if (++regels > 300_000) break
    const m = regel.match(/^(\d{6}) (blob|commit) [0-9a-f]+\s+(-|\d+)\t(.+)$/)
    if (!m) continue
    const [, , soort, grootte, pad] = m
    if (soort === 'commit') { gitlinks.push(pad); continue }
    if (pad === '.gitmodules') gitmodulesBlob = true
    if (!/\.sol$/i.test(pad)) continue
    solTotaal++
    const c = classifyPath(pad, Number(grootte))
    if (c.inScope) { inScope++; inScopeBytes += Number(grootte) } else skipped[c.reason] = (skipped[c.reason] ?? 0) + 1
  }
  const gm = parseGitmodules(gitmodulesTekst)
  const ophaalbaar = gm.filter(s => submoduleToegestaan(s).ok).length
  return {
    solidityFiles: solTotaal, inScopeFiles: inScope, inScopeBytes, skipped,
    submodules: { declared: Math.max(gm.length, gitlinks.length), fetchable: ophaalbaar, gitmodulesBlob },
  }
}

function oordeel(a) {
  if (a.inScopeFiles > 0) return { ok: true }
  if (a.submodules.fetchable > 0) return { ok: true, note: 'No in-scope Solidity in the repository itself. The scan will try to fetch the submodules, which may hold it.' }
  return { ok: false, reason: 'no_in_scope_solidity' }
}

export async function precheckRepo(repoInvoer, { run = gitLoop, nu = Date.now } = {}) {
  const repo = normaliseerRepo(repoInvoer)
  if (!repo) return { ok: false, reason: 'invalid_repo', message: 'Use owner/repo or a github.com URL.' }

  const hit = cache.get(repo)
  if (hit && nu() - hit.t < CACHE_MS) return { ...hit.result, cached: true }
  if (bezig >= MAX_PARALLEL) return { ok: null, repo, reason: 'busy', message: 'The precheck is busy. Try again in a minute.' }

  bezig++
  let dir = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'bi-pre-'))
    // Zonder checkout, en alleen bestanden tot 300 KB (groter telt toch niet mee). Een kloon
    // zonder bestandsinhoud (--filter=blob:none) bleek traag: `ls-tree -l` haalt dan elke
    // bestandsgrootte apart op. Met deze grens is het bij een gemeten repo van 4 MB in ~1 s klaar.
    const kl = await run(['clone', '--depth=1', '--filter=blob:limit=300k', '--no-checkout', '--no-tags', '--single-branch', `https://github.com/${repo}`, dir], { timeout: 30_000 })
    if (kl.code !== 0) {
      const niet = /not found|could not read username|authentication failed|does not exist|403|404/i.test(kl.stderr)
      const r = niet
        ? { ok: false, repo, reason: 'not_found_or_private', message: 'Repository not found, or it is not public.' }
        : { ok: null, repo, reason: 'unavailable', message: 'GitHub could not be reached just now.' }
      if (niet) cache.set(repo, { t: nu(), result: r })
      return r
    }
    const ls = await run(['ls-tree', '-r', '-l', 'HEAD'], { cwd: dir, timeout: 20_000 })
    if (ls.code !== 0) return { ok: null, repo, reason: 'unavailable', message: 'The file list could not be read.' }

    let gm = ''
    if (/^\d{6} blob [0-9a-f]+\s+\d+\t\.gitmodules$/m.test(ls.stdout)) {
      const g = await run(['show', 'HEAD:.gitmodules'], { cwd: dir, timeout: 15_000, maxBuffer: 256 * 1024 })
      if (g.code === 0) gm = g.stdout.slice(0, 100_000)
    }
    const a = analyseerBoom(ls.stdout, gm)
    const o = oordeel(a)
    const geplandKb = Math.min(a.inScopeBytes, MAX_CHUNKS * (CHUNK_CHARS - 80)) / 1024
    const result = {
      ok: o.ok, repo,
      ...(o.reason ? { reason: o.reason, message: 'No Solidity files that count as the project\'s own logic were found. Tests, mocks, scripts, interfaces and vendored dependencies are left out.' } : {}),
      ...(o.note ? { note: o.note } : {}),
      solidityFiles: a.solidityFiles, inScopeFiles: a.inScopeFiles, inScopeKb: Math.round(a.inScopeBytes / 1024),
      skipped: a.skipped, submodules: a.submodules,
      estimate: a.inScopeBytes > 0
        ? { readKb: Math.round(geplandKb), coveragePct: Math.min(100, Math.round(geplandKb * 1024 / a.inScopeBytes * 100)), note: 'Estimate. The scan reads the files most likely to move funds first, in at most six parts, and its report states the real coverage.' }
        : null,
    }
    cache.set(repo, { t: nu(), result })
    if (cache.size > 500) cache.delete(cache.keys().next().value)
    return result
  } catch {
    return { ok: null, repo, reason: 'unavailable', message: 'The precheck failed. Nothing was charged.' }
  } finally {
    bezig--
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
