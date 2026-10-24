/**
 * Bug Intel scope: de regels voor WELKE Solidity-bestanden meetellen, welke submodules
 * mogen worden opgehaald, in welke volgorde en in welke stukken de code naar het
 * analysemodel gaat.
 *
 * Eén bron voor de runner (die de scan doet) en de server (die vooraf een gratis schatting
 * geeft), zodat de schatting en de echte scan nooit uit elkaar lopen. Alleen zuivere
 * functies: geen bestanden, geen netwerk. Getest in bug-intel-scope.test.mjs.
 */

// Mapnamen (hoofdletterongevoelig) die nooit als eigen code tellen.
const DIRS = {
  tests:   ['test', 'tests', 'testing', 'e2e', 'certora', 'echidna', 'fuzz', 'invariant', 'invariants', 'harness', 'harnesses', 'foundry-test'],
  mocks:   ['mock', 'mocks', 'fixtures', 'fixture'],
  scripts: ['script', 'scripts', 'deploy', 'deployments', 'broadcast', 'tasks'],
  vendor:  ['node_modules', 'vendor', 'forge-std', 'ds-test', 'openzeppelin-contracts', 'openzeppelin-contracts-upgradeable', 'solmate', 'solady', '.git', 'out', 'artifacts', 'cache', 'coverage', 'docs', 'doc', 'audit', 'audits'],
  interfaces: ['interfaces', 'interface'],
}
const DIR_REASON = new Map()
for (const [reden, namen] of Object.entries(DIRS)) for (const n of namen) DIR_REASON.set(n, reden)

export const MIN_BYTES = 100
export const MAX_BYTES = 300_000

/**
 * Hoort dit bestand bij de eigen code van het project?
 * @param {string} rel pad t.o.v. de repo-root, met / of \
 * @param {number} bytes bestandsgrootte
 * @returns {{ inScope: true } | { inScope: false, reason: 'tests'|'mocks'|'scripts'|'vendor'|'interfaces'|'tooSmall'|'tooLarge'|'notSolidity' }}
 */
export function classifyPath(rel, bytes) {
  const delen = String(rel).replace(/\\/g, '/').split('/').filter(Boolean)
  if (delen.length === 0) return { inScope: false, reason: 'notSolidity' }
  const naam = delen[delen.length - 1]
  if (!/\.sol$/i.test(naam)) return { inScope: false, reason: 'notSolidity' }

  // `lib` direct onder de root is de map met afhankelijkheden van Foundry. Een `lib` dieper
  // in de boom kan eigen bibliotheekcode van het project zijn en blijft dus staan.
  if (delen.length > 1 && delen[0].toLowerCase() === 'lib') return { inScope: false, reason: 'vendor' }

  for (const dir of delen.slice(0, -1)) {
    const reden = DIR_REASON.get(dir.toLowerCase())
    if (reden) return { inScope: false, reason: reden }
  }

  if (/\.(t|s)\.sol$/i.test(naam)) return { inScope: false, reason: /\.s\.sol$/i.test(naam) ? 'scripts' : 'tests' }
  if (/^(mock|fake|dummy)/i.test(naam) || /(mock|mocks)\.sol$/i.test(naam)) return { inScope: false, reason: 'mocks' }
  if (/^test/i.test(naam) || /(test|tests|harness)\.sol$/i.test(naam)) return { inScope: false, reason: 'tests' }
  if (/^I[A-Z][A-Za-z0-9_]*\.sol$/.test(naam)) return { inScope: false, reason: 'interfaces' }

  if (typeof bytes === 'number') {
    if (bytes < MIN_BYTES) return { inScope: false, reason: 'tooSmall' }
    if (bytes > MAX_BYTES) return { inScope: false, reason: 'tooLarge' }
  }
  return { inScope: true }
}

/** Een bestand zonder contract of library erin (alleen interfaces/types) bevat geen logica om te auditen. */
export function hasLogic(text) {
  return /\b(contract|library)\s+[A-Za-z_]\w*/.test(text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))
}

/** Leest .gitmodules (ini-achtig) en geeft { name, path, url } per submodule. */
export function parseGitmodules(text) {
  const out = []
  let huidig = null
  for (const ruw of String(text).split(/\r?\n/)) {
    const regel = ruw.trim()
    const kop = regel.match(/^\[submodule\s+"(.+)"\]$/)
    if (kop) { huidig = { name: kop[1], path: '', url: '' }; out.push(huidig); continue }
    const kv = regel.match(/^(path|url)\s*=\s*(.+)$/)
    if (kv && huidig) huidig[kv[1]] = kv[2].trim()
  }
  return out.filter(s => s.path && s.url)
}

const GITHUB_HTTPS = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(\.git)?\/?$/

/**
 * Mag deze submodule worden opgehaald? Alleen https naar github.com, een veilig relatief
 * pad, en niet in een map die we toch overslaan (afhankelijkheden hoeven we niet te halen).
 * De inhoud van .gitmodules komt van de repo van de klant en is dus onvertrouwd.
 */
export function submoduleToegestaan({ path, url }) {
  if (!GITHUB_HTTPS.test(url)) return { ok: false, reason: 'url-niet-github-https' }
  const p = String(path).replace(/\\/g, '/')
  if (p.startsWith('/') || p.startsWith('-') || /(^|\/)\.\.(\/|$)/.test(p) || /[\0\n\r]/.test(p)) return { ok: false, reason: 'onveilig-pad' }
  const delen = p.split('/').filter(Boolean)
  if (delen.length === 0) return { ok: false, reason: 'onveilig-pad' }
  if (delen[0].toLowerCase() === 'lib') return { ok: false, reason: 'afhankelijkheid' }
  for (const d of delen) {
    const reden = DIR_REASON.get(d.toLowerCase())
    if (reden === 'vendor' || reden === 'tests' || reden === 'mocks' || reden === 'scripts') return { ok: false, reason: 'afhankelijkheid' }
  }
  return { ok: true }
}

const RISICO = [
  [/\.call\s*[({]/, 3], [/delegatecall/, 3], [/\.transfer\(|safeTransfer|transferFrom|\.send\(/, 2],
  [/selfdestruct/, 2], [/ecrecover|ECDSA|signature/i, 2], [/latestRoundData|oracle|getPrice|\bprice\b/i, 2],
  [/function\s+(withdraw|deposit|redeem|mint|burn|borrow|repay|liquidat|swap|claim|stake|unstake|execute|settle)\w*/i, 2],
]
const NAAM_BONUS = /(vault|pool|market|lending|core|manager|router|controller|treasury|staking|bridge|factory|pair|oracle|reward|escrow)/i

/** Hoe waarschijnlijk is het dat hier geld of rechten wisselen? Hoger = eerder analyseren. */
export function rankScore(rel, text) {
  let s = 0
  for (const [re, w] of RISICO) if (re.test(text)) s += w
  if (NAAM_BONUS.test(String(rel))) s += 2
  s += Math.min(3, Math.floor(text.length / 8000))
  return s
}

/**
 * Verdeel de bestanden over stukken van hoogstens `chunkChars` tekens, op volgorde van
 * risico. Een bestand dat groter is dan een stuk wordt op regelgrenzen in delen gesneden.
 * Nooit meer dan `maxChunks` stukken. Alles wat er niet in past staat in `notAnalysed`.
 *
 * @param {{rel:string, text:string, score:number}[]} files
 */
export function planChunks(files, { chunkChars = 20_000, maxChunks = 6 } = {}) {
  const gesorteerd = [...files].sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel))
  // Elk stuk krijgt 80 tekens kop mee ("// === FILE: ... ==="); reken dat vooraf af, anders
  // past een deel van precies chunkChars tekens er net niet meer in.
  const limiet = chunkChars - 80
  const delen = []
  for (const f of gesorteerd) {
    if (f.text.length <= limiet) { delen.push({ rel: f.rel, label: f.rel, text: f.text, deel: 1, van: 1 }); continue }
    // Een enkele regel langer dan een stuk (geminimaliseerde code) wordt hard doorgesneden.
    const regels = f.text.split('\n').flatMap(r => {
      if (r.length <= limiet) return [r]
      const stukjes = []
      for (let i = 0; i < r.length; i += limiet) stukjes.push(r.slice(i, i + limiet))
      return stukjes
    })
    let buf = [], len = 0
    const stukken = []
    for (const r of regels) {
      if (len + r.length + 1 > limiet && buf.length) { stukken.push(buf.join('\n')); buf = []; len = 0 }
      buf.push(r); len += r.length + 1
    }
    if (buf.length) stukken.push(buf.join('\n'))
    stukken.forEach((t, i) => delen.push({ rel: f.rel, label: `${f.rel} (part ${i + 1}/${stukken.length})`, text: t, deel: i + 1, van: stukken.length }))
  }

  const chunks = []
  let cur = null
  const niet = []
  for (const d of delen) {
    if (cur && cur.chars + d.text.length + 80 <= chunkChars) { cur.parts.push(d); cur.chars += d.text.length + 80; continue }
    if (chunks.length >= maxChunks) { niet.push(d); continue }
    cur = { parts: [d], chars: d.text.length + 80 }
    chunks.push(cur)
  }
  return { chunks, notAnalysed: niet }
}
