#!/usr/bin/env node
/**
 * Bug Intel Runner — automatische Al-Mizaan audit pipeline per job.
 * Gebruik: node bug-intel-runner.mjs <jobId>
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync, lstatSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, spawn } from 'node:child_process'
import { classifyPath, hasLogic, parseGitmodules, submoduleToegestaan, rankScore, planChunks } from './bug-intel-scope.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = join(HERE, '..')

// --- Env laden ---
const envPath = join(BASE, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const MODEL        = process.env.BUG_INTEL_MODEL   ?? 'qwen2.5:7b'
const OLLAMA       = process.env.OLLAMA_BASE_URL    ?? 'http://localhost:11434'
const QUEUE_FILE   = join(BASE, 'data/bug-intel-queue.jsonl')
const REPORTS_DIR  = join(BASE, 'data/bug-intel-reports')
const LEARNING     = join(BASE, 'data/bug-intel-learning.jsonl')
const PATTERNS_F   = join(BASE, 'data/bug-intel-patterns.json')
const ADMIN_URL    = 'http://localhost:3748/admin/bug-intel-complete'
const TEL_TOKEN    = process.env.TELEGRAM_TOKEN   ?? ''
const TEL_CHAT     = process.env.TELEGRAM_CHAT_ID ?? ''
// ADMIN_SECRET heeft voorrang; zonder blijft het oude gedrag (eerste 20 tekens van de Telegram-token) werken.
const ADMIN_KEY    = process.env.ADMIN_SECRET ?? TEL_TOKEN.slice(0, 20)

// Protocol-type detectie — puur op basis van bestandsnamen + broncode keywords
function detectProtocolType(fileNames, source) {
  const names = fileNames.join(' ').toLowerCase()
  const src   = source.slice(0, 8000).toLowerCase()
  const has   = (...kw) => kw.some(k => names.includes(k) || src.includes(k))

  if (has('swap', 'pool', 'amm', 'liquidity', 'pair', 'reserves', 'uniswap', 'router'))
    return 'DEX'
  if (has('borrow', 'repay', 'collateral', 'ltv', 'liquidat', 'comptroller', 'lending', 'interest', 'vault'))
    return 'LENDING'
  if (has('bridge', 'crosschain', 'cross_chain', 'layerzero', 'relay', 'lock', 'unlock', 'wormhole'))
    return 'BRIDGE'
  if (has('governor', 'proposal', 'timelock', 'vote', 'dao', 'governance'))
    return 'GOVERNANCE'
  if (has('stake', 'reward', 'yield', 'harvest', 'farm', 'staking'))
    return 'STAKING'
  if (has('option', 'strike', 'expiry', 'premium', 'perp', 'funding', 'perpetual'))
    return 'DERIVATIVES'
  return 'GENERAL'
}

// Protocol-type-specifieke aanvalsvectoren voor Phase 2
function getTypeAttackVectors(type) {
  const vectors = {
    DEX: `
TYPE-SPECIFIC FOCUS (DEX/AMM):
- Price manipulation via flash loans before trades
- Sandwich attacks: inflating price, victim trade, deflating
- Incorrect k-invariant or reserve calculation after fees
- Reentrancy during token callbacks (ERC-777, low-level calls)
- Integer overflow/underflow in price ratio math`,

    LENDING: `
TYPE-SPECIFIC FOCUS (Lending/Borrowing):
- Oracle manipulation to create undercollateralized positions
- Bad debt: can an attacker borrow more than collateral value?
- Liquidation bonus manipulation or blocking liquidations
- Interest accrual errors: can they inflate/deflate balances?
- Flash loan attacks: borrow, manipulate oracle, liquidate`,

    BRIDGE: `
TYPE-SPECIFIC FOCUS (Bridge/Cross-chain):
- Message replay: same message accepted on both chains
- Double-spending: mint on destination without valid source lock
- Signature/proof verification bypass
- Access control: who can process messages? Any caller?
- Nonce/sequence ordering: can messages be replayed or skipped?`,

    GOVERNANCE: `
TYPE-SPECIFIC FOCUS (Governance/DAO):
- Flash loan governance attack: borrow tokens, vote, return
- Timelock bypass or griefing (DoS on execution)
- Proposal manipulation: frontrunning execution
- Quorum manipulation with token inflation/deflation
- Delegated voting weight double-counting`,

    STAKING: `
TYPE-SPECIFIC FOCUS (Staking/Yield):
- Reward distribution manipulation: enter before snapshot, exit after
- Reward dilution or inflation by large deposits
- Reentrancy during unstake/harvest callbacks
- Incorrect reward calculation when total supply changes
- Griefing: block reward claims by others`,

    DERIVATIVES: `
TYPE-SPECIFIC FOCUS (Options/Derivatives/Perps):
- Oracle manipulation near expiry/liquidation
- Funding rate manipulation
- Position size limits bypass
- Margin calculation errors under extreme price moves
- Settlement disputes: who decides the final price?`,

    GENERAL: ''
  }
  return vectors[type] ?? ''
}

// Leer-patronen laden (aangemaakt door bug-intel-learner.mjs)
function loadPatternHints() {
  if (!existsSync(PATTERNS_F)) return ''
  try {
    const p = JSON.parse(readFileSync(PATTERNS_F, 'utf8'))
    if (!p.promptHints?.length) return ''
    return '\n\nLEARNED PATTERNS (from previous jobs):\n' + p.promptHints.map(h => `- ${h}`).join('\n')
  } catch { return '' }
}

// Relevante patronen uit 3ilm kennisbank — 27.681 echte bevindingen
const TYPE_PATTERNS = {
  DEX:         ['oracle-manipulation', 'mev-slippage', 'rounding', 'flash-loan', 'fee-miscalculation', 'reentrancy'],
  LENDING:     ['oracle-manipulation', 'liquidation', 'staleness', 'rounding', 'flash-loan', 'access-control'],
  BRIDGE:      ['access-control', 'reentrancy', 'overflow', 'dos-griefing'],
  GOVERNANCE:  ['access-control', 'dos-griefing', 'idor', 'trusted-actor'],
  STAKING:     ['rounding', 'fee-miscalculation', 'access-control', 'overflow', 'staleness'],
  DERIVATIVES: ['oracle-manipulation', 'liquidation', 'staleness', 'rounding', 'flash-loan'],
  GENERAL:     ['oracle-manipulation', 'rounding', 'access-control', 'fee-miscalculation', 'reentrancy', 'flash-loan']
}

function load3ilmHints(protocolType) {
  const indexPath = join(BASE, 'knowledge/3ilm/sherlock/_index.json')
  if (!existsSync(indexPath)) return ''
  try {
    const index    = JSON.parse(readFileSync(indexPath, 'utf8'))
    const patterns = index.pattern_library ?? {}
    const relevant = (TYPE_PATTERNS[protocolType] ?? TYPE_PATTERNS.GENERAL)
      .map(key => [key, patterns[key]])
      .filter(([, v]) => v)
      .sort(([, a], [, b]) => parseFloat(b.acceptance_rate) - parseFloat(a.acceptance_rate))

    if (!relevant.length) return ''

    // Laad gecalibreerde precisie als die beschikbaar is
    let calibrated = {}
    try {
      const pf = JSON.parse(readFileSync(PATTERNS_F, 'utf8'))
      for (const c of (pf.calibratedPatterns ?? [])) calibrated[c.pattern] = c
    } catch { /* geen patterns.json */ }

    const lines = relevant.map(([key, v]) => {
      const basePct = Math.round(parseFloat(v.acceptance_rate) * 100)
      const cal     = calibrated[key]
      const myPart  = cal ? ` | JOUW precisie: ${cal.myPrec}% (${cal.valid}v/${cal.fp}fp)` : ''
      const ok      = (v.examples_accepted ?? []).slice(0, 2).map(e => `    ACCEPTED: ${e.slice(0, 90)}`).join('\n')
      // De afgewezen voorbeelden zijn het deel dat niemand anders heeft, en ze lagen hier
      // ongebruikt: 11.638 stuks. Zie de uitleg hieronder waarom ze er nu wél in gaan.
      const nok     = (v.examples_rejected ?? []).slice(0, 2).map(e => `    REJECTED: ${e.slice(0, 90)}`).join('\n')
      const stukken = [`- ${key}: ${basePct}% accepted of ${v.total} reports (${v.accepted} in, ${v.rejected} out)${myPart}`, ok, nok].filter(Boolean)
      return stukken.join('\n')
    })

    /**
     * WAAROM DE AFGEWEZEN VOORBEELDEN ER NU BIJ ZITTEN
     *
     * De patroonbibliotheek bevat naast `examples_accepted` ook `examples_rejected`. Dat
     * tweede veld werd nergens gebruikt, terwijl het over 11.638 afgewezen bevindingen
     * gaat uit echte contests.
     *
     * Kijk naar de verhoudingen: trusted-actor 4081 geaccepteerd tegen 3393 afgewezen,
     * staleness 2649 tegen 2226, reentrancy 458 tegen 426. Over de hele linie ligt de
     * acceptatie tussen 45 en 58 procent. Anders gezegd: **voor elke echte bevinding is er
     * ongeveer één die er precies zo uitziet en toch wordt weggegooid.**
     *
     * Een model dat alleen de geaccepteerde voorbeelden ziet, leert de helft van het vak.
     * Het leert waar een bevinding op lijkt, niet waar een valse bevinding op lijkt. En
     * juist dat laatste is waarom 67% van de vakmensen automatische scanners waardeloos
     * noemt: die braken veertig plausibele dingen uit waarvan er drie echt zijn.
     *
     * Dit is ook precies waar wij ons op onderscheiden. Al-Mizaan weigert te melden wat
     * niet bewezen kan worden. Die discipline hoort in de prompt te zitten, niet alleen in
     * de poort achteraf, want achteraf weggooien kost een hele scan.
     */
    return `\n\nHISTORICAL PATTERNS (${index.total_findings} real findings from past contests).\n` +
      `Read both sides. For every pattern you see what got ACCEPTED and what got REJECTED.\n` +
      `Acceptance sits between 45% and 58% across all patterns: roughly one in two reports\n` +
      `that look exactly like these gets thrown out. Before you report anything, check it\n` +
      `against the REJECTED examples first. A finding you cannot separate from a rejected\n` +
      `one is not a finding.\n${lines.join('\n')}`
  } catch { return '' }
}

const jobId = process.argv[2]
if (!jobId) { console.error('Gebruik: node bug-intel-runner.mjs <jobId>'); process.exit(1) }

// --- Queue helpers ---
function readJob(id) {
  if (!existsSync(QUEUE_FILE)) return null
  const lines = readFileSync(QUEUE_FILE, 'utf8').split('\n').filter(Boolean)
  const records = lines
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(r => r?.jobId === id)
  if (!records.length) return null
  return Object.assign({}, ...records)
}

function updateJob(fields) {
  appendFileSync(QUEUE_FILE, JSON.stringify({ jobId, ts: Date.now(), ...fields }) + '\n')
}

// --- Telegram ---
async function tg(text) {
  if (!TEL_TOKEN || !TEL_CHAT) return
  try {
    await fetch(`https://api.telegram.org/bot${TEL_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TEL_CHAT, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(8_000)
    })
  } catch {}
}

// --- Ollama (streaming, keepalive uit, retry bij transient fetch failed) ---
async function ollama(userPrompt, systemPrompt, _retries = 2) {
  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: userPrompt })

  let lastErr
  for (let attempt = 0; attempt <= _retries; attempt++) {
    if (attempt > 0) {
      console.log(`[runner] Ollama retry ${attempt}/${_retries}...`)
      await new Promise(r => setTimeout(r, 3000))
    }
    try {
      const resp = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
        body: JSON.stringify({
          model: MODEL,
          messages,
          stream: true,
          options: { temperature: 0.1, num_ctx: 16384, num_predict: 2048 }
        }),
        signal: AbortSignal.timeout(1_200_000)
      })
      if (!resp.ok) throw new Error(`Ollama ${resp.status}: ${await resp.text()}`)

  // Lees streaming NDJSON — elke chunk is een JSON-regel
  const decoder = new TextDecoder()
  const reader  = resp.body.getReader()
  let fullText  = ''
  let buffer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        if (obj.message?.content) fullText += obj.message.content
      } catch {}
    }
  }
      return fullText.trim()
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

// --- Gratis LLM-keten (OpenAI-compatibel) ----------------------------------
// Toegevoegd 2026-08-15. Aanleiding, in twee stappen gemeten:
//  1. Een echte scan op lokale Ollama liep in fase 2 op de 20-minuten-timeout
//     ("fetch failed"), net als 5 eerdere jobs. Het product kon niet leveren.
//  2. Met Cerebras erbij: 4 seconden en een afgeleverd rapport. Maar de tweede
//     test gaf 429 "Tokens per day limit exceeded" — de gratis tier heeft een
//     daglimiet, en daarna lag het product er weer uit.
// Eén gratis bron met een dagquotum is te dun voor een betaald product. Vandaar
// een keten: valt er een weg, dan pakt de volgende het op. Ollama blijft het
// laatste vangnet: traag, maar zonder quotum en zonder netwerkafhankelijkheid.
const LLM_BRONNEN = [
  { naam: 'Cerebras',   url: 'https://api.cerebras.ai/v1',   env: 'CEREBRAS_API_KEY',   model: process.env.CEREBRAS_MODEL   ?? 'gpt-oss-120b' },
  { naam: 'Groq',       url: 'https://api.groq.com/openai/v1', env: 'GROQ_API_KEY',     model: process.env.GROQ_MODEL       ?? 'openai/gpt-oss-120b' },
  { naam: 'SambaNova',  url: 'https://api.sambanova.ai/v1',  env: 'SAMBANOVA_API_KEY',  model: process.env.SAMBANOVA_MODEL  ?? 'Meta-Llama-3.3-70B-Instruct' },
  { naam: 'Together',   url: 'https://api.together.xyz/v1',  env: 'TOGETHER_API_KEY',   model: process.env.TOGETHER_MODEL   ?? 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { naam: 'OpenRouter', url: 'https://openrouter.ai/api/v1', env: 'OPENROUTER_API_KEY', model: process.env.OPENROUTER_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b:free' },
  { naam: 'Mistral',    url: 'https://api.mistral.ai/v1',    env: 'MISTRAL_API_KEY',    model: process.env.MISTRAL_MODEL    ?? 'codestral-latest' },
]

function beschikbareBronnen() {
  return LLM_BRONNEN.filter(b => (process.env[b.env] ?? '').trim().length > 0)
}

// alGewacht voorkomt dat een bron ons twee keer achter elkaar laat wachten.
async function cloudLLM(bron, userPrompt, systemPrompt, alGewacht = false) {
  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: userPrompt })

  const resp = await fetch(`${bron.url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(process.env[bron.env] ?? '').trim()}`,
    },
    body: JSON.stringify({
      model: bron.model,
      messages,
      temperature: 0.1,
      // Ruim budget: redeneermodellen besteden hun eerste tokens aan een denkstap
      // die NIET in content belandt. Te krap en content komt leeg terug terwijl
      // de call slaagde, waarna de keten denkt dat de bron stuk is.
      max_tokens: 4096,
    }),
    // 120 seconden was te krap en dat kostte meteen een hele scan. Het grootste gratis
    // model (nemotron 550B) deed 108,9s over fase 2; zodra de 3ilm-hints erbij kwamen met
    // ook de afgewezen voorbeelden, liep hij eroverheen en viel de scan om op een
    // time-out. Vier minuten is voor een betaald rapport geen enkel bezwaar: de klant
    // wacht toch al op een grondige analyse, en een scan die afbreekt levert nul op.
    signal: AbortSignal.timeout(240_000),
  })
  if (resp.status === 429) {
    // Tijdelijke limiet, geen defecte bron. De provider zegt zelf wanneer het weer
    // mag; dat afwachten is beter dan doorschuiven naar een zwakker model.
    // Plafond op 45s: een dagquotum ("tokens per day") reset niet binnen een
    // scan, en daar willen we niet op blijven wachten.
    const na = resp.headers.get('retry-after')
    const reset = resp.headers.get('x-ratelimit-reset-tokens') || resp.headers.get('x-ratelimit-reset-requests')
    let wachtS = na ? parseFloat(na) : (reset ? parseFloat(String(reset).replace(/[^0-9.]/g, '')) : 0)
    const body429 = (await resp.text()).slice(0, 160)
    const dagQuotum = /per day|daily/i.test(body429)
    // Geen bruikbare header? Dan een vaste, korte wachttijd. Providers melden hun
    // reset lang niet altijd, en zonder deze terugval schuift de keten alsnog door
    // naar een zwakker model terwijl een halve minuut geduld genoeg was.
    if (!wachtS || wachtS <= 0) wachtS = 25
    if (!alGewacht && !dagQuotum && wachtS <= 45) {
      console.log(`[runner] ${bron.naam} rate-limit — wacht ${wachtS.toFixed(1)}s en probeer opnieuw`)
      await new Promise(r => setTimeout(r, Math.ceil(wachtS * 1000) + 500))
      return await cloudLLM(bron, userPrompt, systemPrompt, true)
    }
    throw new Error(`${bron.naam} 429${dagQuotum ? ' (dagquotum)' : ''}: ${body429}`)
  }
  if (!resp.ok) throw new Error(`${bron.naam} ${resp.status}: ${(await resp.text()).slice(0, 160)}`)
  const data = await resp.json()
  const text = (data?.choices?.[0]?.message?.content ?? '').trim()
  if (!text) throw new Error(`${bron.naam} gaf een leeg content-veld`)
  return text
}

// Welk model draait er werkelijk? Het klantrapport noemt dit, dus het moet
// kloppen met de bron die askLLM daadwerkelijk gebruikt. Wordt lui bepaald:
// bij het opstellen van het rapport is bekend welke bron het geworden is.
// Wordt gevuld door askLLM zodra een bron daadwerkelijk antwoordt. Het rapport
// leest dit, zodat er nooit een bron in staat die het werk niet heeft gedaan.
let LAATSTE_BRON = null

function actiefModel() {
  if (LAATSTE_BRON) return `${LAATSTE_BRON.model} (${LAATSTE_BRON.naam})`
  return MODEL
}

// Loopt de keten af en gebruikt de eerste bron die antwoordt.
async function askLLM(userPrompt, systemPrompt) {
  for (const bron of beschikbareBronnen()) {
    try {
      const t0 = Date.now()
      const out = await cloudLLM(bron, userPrompt, systemPrompt)
      console.log(`[runner] ${bron.naam} antwoordde in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
      LAATSTE_BRON = bron
      return out
    } catch (e) {
      console.warn(`[runner] ${bron.naam} faalde: ${e.message.slice(0, 120)}`)
    }
  }
  console.warn('[runner] Alle cloud-bronnen op — val terug op lokale Ollama (traag)')
  LAATSTE_BRON = { naam: 'lokale Ollama', model: MODEL }
  return await ollama(userPrompt, systemPrompt)
}

// Welke bronnen tellen als "sterk genoeg voor betaald werk". Dezelfde lijst die de
// kwaliteitspoort onderaan gebruikt; hier gedefinieerd zodat fase 2 er vooraf op kan
// sturen in plaats van achteraf te worden afgekeurd.
const STERKE_BRONNEN = ['Cerebras', 'Groq', 'SambaNova', 'Together', 'OpenRouter', 'Mistral']

/**
 * Vraagt het zware werk aan een sterke bron, en WACHT als ze even niet kunnen.
 *
 * De gewone askLLM loopt de keten af en pakt de eerste die antwoordt. Voor fase 2 is dat
 * fout: valt hij door naar een klein model, dan weigert de kwaliteitspoort het rapport
 * verderop alsnog. Je hebt dan tokens en tijd uitgegeven aan iets dat gegarandeerd de
 * prullenbak in gaat.
 *
 * Daarom: eerst alleen de sterke bronnen proberen. Lukt dat niet, dan even wachten en
 * opnieuw. Pas na drie rondes vallen we terug op de volle keten, zodat een scan nooit voor
 * altijd blijft hangen.
 *
 * LET OP bij het afstellen van `wachtMs`: niet elke limiet is er een per minuut. Gemeten
 * op 2026-08-17 gaf Cerebras "Tokens per day limit exceeded" — daar helpt geen enkele
 * wachttijd tegen, die reset pas de volgende dag. Wachten helpt bij limieten per minuut
 * en bij drukte aan hun kant (SambaNova zegt letterlijk "experiencing high demand").
 * Daarom drie korte rondes en niet eindeloos doorwachten.
 */
async function askLLMSterk(userPrompt, systemPrompt, rondes = 3, wachtMs = 40_000, opties = {}) {
  // v2: `overslaan` laat een tweede poging een ANDERE sterke bron nemen dan de eerste, en
  // `alleenSterk` gooit een fout in plaats van door te vallen op een zwak of lokaal model,
  // zodat de aanroeper kan zeggen "dit stuk is niet geanalyseerd" in plaats van ruis te leveren.
  const alleSterk = beschikbareBronnen().filter(b => STERKE_BRONNEN.includes(b.naam))
  const zonderOverslaan = alleSterk.filter(b => !(opties.overslaan ?? []).includes(b.naam))
  const sterk = zonderOverslaan.length > 0 ? zonderOverslaan : alleSterk
  if (sterk.length === 0) {
    if (opties.alleenSterk) throw new Error('geen sterke bron geconfigureerd')
    console.warn('[runner] Geen sterke bron geconfigureerd — gewone keten')
    return await askLLM(userPrompt, systemPrompt)
  }

  const tijdOp = () => opties.deadline && Date.now() > opties.deadline
  for (let ronde = 1; ronde <= rondes; ronde++) {
    for (const bron of sterk) {
      if (tijdOp()) throw new Error('tijdsbudget op')
      try {
        const t0 = Date.now()
        const out = await cloudLLM(bron, userPrompt, systemPrompt)
        console.log(`[runner] ${bron.naam} antwoordde in ${((Date.now() - t0) / 1000).toFixed(1)}s (ronde ${ronde})`)
        LAATSTE_BRON = bron
        return out
      } catch (e) {
        console.warn(`[runner] ${bron.naam} faalde (ronde ${ronde}): ${e.message.slice(0, 110)}`)
      }
    }
    if (ronde < rondes) {
      if (tijdOp()) throw new Error('tijdsbudget op')
      console.log(`[runner] Alle sterke bronnen even bezet — ${wachtMs / 1000}s wachten en opnieuw.`)
      console.log('[runner] Wachten is beter dan doorvallen: een zwak model wordt verderop toch geweigerd.')
      await new Promise(r => setTimeout(r, wachtMs))
    }
  }

  if (opties.alleenSterk) throw new Error('sterke bronnen bleven bezet na alle rondes')
  console.warn('[runner] Sterke bronnen bleven bezet na alle rondes — terug naar de gewone keten.')
  return await askLLM(userPrompt, systemPrompt)
}


// --- Warm-up ping (model in geheugen laden + socket leeg lezen) ---
async function ollamaWarmup() {
  // Zinloos zolang Cerebras het werk doet: dit laadt een lokaal model dat
  // we dan niet aanroepen, en kostte in de praktijk tot 180 seconden.
  if (beschikbareBronnen().length > 0) { console.log('[runner] Warm-up overgeslagen (cloud-bron actief)'); return }
  try {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'ready' }],
        stream: false,
        options: { num_predict: 3, temperature: 0 }
      }),
      signal: AbortSignal.timeout(180_000)
    })
    await r.text() // response body volledig consumeren — anders blijft socket half-open
    console.log('[runner] Ollama warm-up OK')
  } catch (e) {
    console.warn(`[runner] Warm-up mislukt (gaan toch door): ${e.message}`)
  }
}

// ===== v2: klonen, scope bepalen, dekking meten, eerlijk rapporteren =====
//
// Wat v2 oplost (gemeten op de uitgerolde versie, zie RESULTS-2026-10-24 in
// holistis/bug-bounty-intelligence-mcp):
//  1. Repos met git-submodules faalden zonder rapport: de code stond in de submodule en
//     die werd nooit opgehaald.
//  2. Een scan zonder enige hypothese werd als "klaar" afgeleverd, zonder te zeggen hoeveel
//     van de code er eigenlijk bekeken was.
//  3. Slechts de eerste ~22 KB van de eerste 30 KB broncode ging naar het model, in
//     mapvolgorde, en dat stond nergens in het rapport.
//  4. Een symlink met de naam x.sol in een ingediende repo werd gevolgd en de inhoud van
//     het doelbestand ging naar het model. Nu worden symlinks nooit gelezen.

class JobFout extends Error {
  constructor(klasse, bericht) { super(bericht); this.klasse = klasse }
}

const MAX_CHUNKS     = Math.max(1, Math.min(10, Number(process.env.BUG_INTEL_MAX_CHUNKS ?? 6)))
const CHUNK_CHARS    = 20_000
const JOB_BUDGET_MS  = 30 * 60 * 1000   // de watcher markeert na 45 minuten als vastgelopen
const MAX_CLONE_KB   = 400 * 1024
const MAX_WALK       = 60_000           // bestanden die we hooguit bekijken
const MAX_SOL_READ   = 3_000
const MAX_TOTAL_READ = 20 * 1024 * 1024  // totaal aan broncode in het geheugen

// Git draait met een kaal milieu: geen sleutels uit onze omgeving mee naar andermans code.
function git(args, { cwd, timeout = 120_000 } = {}) {
  return spawnSync('git', ['-c', 'protocol.file.allow=never', '-c', 'core.hooksPath=/dev/null', '-c', 'advice.detachedHead=false', ...args], {
    cwd, timeout, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/root', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'https', LANG: 'C' },
  })
}

function mapGrootteKb(dir) {
  const r = spawnSync('du', ['-sk', dir], { encoding: 'utf8', timeout: 30_000 })
  return Number.parseInt((r.stdout ?? '').split(/\s+/)[0], 10) || 0
}

function kloonRepo(repo, tmpDir) {
  const r = git(['clone', '--depth=1', '--single-branch', '--no-tags', `https://github.com/${repo}`, tmpDir])
  if (r.status !== 0) {
    const fout = String(r.stderr ?? '')
    if (/not found|could not read username|authentication failed|repository .* does not exist|403|404/i.test(fout)) {
      throw new JobFout('repo-niet-gevonden', 'repository not found or not public')
    }
    throw new JobFout('tijdelijk', `git clone failed: ${fout.slice(0, 160)}`)
  }
  if (mapGrootteKb(tmpDir) > MAX_CLONE_KB) throw new JobFout('te-groot', 'repository is larger than the 400 MB limit')

  const sub = { declared: 0, fetched: [], failed: [], skipped: [] }
  const gm = join(tmpDir, '.gitmodules')
  let gmOk = false
  try { gmOk = existsSync(gm) && lstatSync(gm).isFile() } catch {}
  if (gmOk) {
    const lijst = parseGitmodules(readFileSync(gm, 'utf8').slice(0, 100_000)).slice(0, 12)
    sub.declared = lijst.length
    for (const sm of lijst) {
      const mag = submoduleToegestaan(sm)
      if (!mag.ok) { sub.skipped.push({ path: sm.path, reason: mag.reason }); continue }
      const u = git(['submodule', 'update', '--init', '--depth=1', '--', sm.path], { cwd: tmpDir, timeout: 150_000 })
      if (u.status === 0) {
        sub.fetched.push(sm.path)
        if (mapGrootteKb(tmpDir) > MAX_CLONE_KB) throw new JobFout('te-groot', 'repository plus submodules is larger than the 400 MB limit')
      } else {
        sub.failed.push({ path: sm.path, reason: String(u.stderr ?? '').split('\n').find(l => l.trim())?.slice(0, 120) ?? 'unknown' })
      }
    }
  }
  return sub
}

// Loopt de boom af. Symlinks en andere niet-gewone bestanden worden NOOIT gelezen.
function scanScope(root) {
  const overgeslagen = { tests: 0, mocks: 0, scripts: 0, vendor: 0, interfaces: 0, tooSmall: 0, tooLarge: 0, noLogic: 0, symlink: 0, unreadable: 0 }
  const files = []
  let bezocht = 0, solGelezen = 0, totaalGelezen = 0
  const loop = (dir, rel, diepte) => {
    if (diepte > 14 || bezocht > MAX_WALK) return
    let items
    try { items = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of items) {
      if (++bezocht > MAX_WALK) return
      if (e.name === '.git' || e.name === 'node_modules') continue
      const relPad = rel ? `${rel}/${e.name}` : e.name
      if (e.isSymbolicLink()) { if (/\.sol$/i.test(e.name)) overgeslagen.symlink++; continue }
      if (e.isDirectory()) { loop(join(dir, e.name), relPad, diepte + 1); continue }
      if (!e.isFile() || !/\.sol$/i.test(e.name)) continue
      let st
      try { st = lstatSync(join(dir, e.name)) } catch { overgeslagen.unreadable++; continue }
      if (!st.isFile()) { overgeslagen.symlink++; continue }
      const c = classifyPath(relPad, st.size)
      if (!c.inScope) { overgeslagen[c.reason] = (overgeslagen[c.reason] ?? 0) + 1; continue }
      if (solGelezen++ >= MAX_SOL_READ || totaalGelezen + st.size > MAX_TOTAL_READ) { overgeslagen.overflow = (overgeslagen.overflow ?? 0) + 1; continue }
      totaalGelezen += st.size
      let tekst
      try { tekst = readFileSync(join(dir, e.name), 'utf8') } catch { overgeslagen.unreadable++; continue }
      if (!hasLogic(tekst)) { overgeslagen.noLogic++; continue }
      files.push({ rel: relPad, bytes: st.size, text: tekst, score: rankScore(relPad, tekst) })
    }
  }
  loop(root, '', 0)
  return { files, overgeslagen }
}

function parseFindings(tekst) {
  const uit = []
  for (const block of tekst.split('---FINDING---').slice(1)) {
    const endIdx = block.indexOf('---END---')
    const body = endIdx >= 0 ? block.slice(0, endIdx) : block
    const get = (key) => {
      const re = new RegExp(`^${key}:\\s*(.+?)(?=\\n[A-Z_]+:|$)`, 'ms')
      const m = body.match(re)
      return m ? m[1].trim() : ''
    }
    const confidence = parseFloat(get('CONFIDENCE')) || 0
    if (confidence < 0.4) continue
    uit.push({
      title: get('TITLE'), severity: get('SEVERITY') || 'Low', category: get('CATEGORY'),
      file: get('FILE'), function: get('FUNCTION'), description: get('DESCRIPTION'),
      attackPath: get('ATTACK_PATH'), impact: get('IMPACT'), recommendation: get('RECOMMENDATION'), confidence,
    })
  }
  return uit
}

// Een hypothese moet naar code wijzen die in dit stuk echt staat. Bestanden en functies
// die het model verzint, vallen hier af.
function wijstNaarEchteCode(f, chunk) {
  const basis = String(f.file ?? '').split(/[\\/]/).pop().toLowerCase()
  if (!basis) return 'geen-bestand'
  const delen = chunk.parts.filter(p => p.rel.split('/').pop().toLowerCase() === basis)
  if (delen.length === 0) return 'bestand-niet-in-stuk'
  const naam = String(f.function ?? '').replace(/\(.*$/s, '').trim().split('.').pop()
  if (naam && !delen.some(p => p.text.includes(naam))) return 'functie-niet-gevonden'
  return null
}

function chunkTekst(chunk) {
  return chunk.parts.map(p => `\n\n// === FILE: ${p.label} ===\n${p.text}`).join('')
}

// --- HTML rapport bouwen ---
function buildHtml(repo, findings, modelNamen, durationMs, cov, outcome) {
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  const SCOLOR = { Critical: '#dc2626', High: '#ea580c', Medium: '#ca8a04', Low: '#16a34a', Info: '#6b7280' }
  const SEVS = ['Critical', 'High', 'Medium', 'Low', 'Info']

  const statsHtml = SEVS.map(s => {
    const n = findings.filter(f => f.severity === s).length
    return `<div class="stat"><span class="badge" style="background:${SCOLOR[s]}">${s}</span><span class="count">${n}</span></div>`
  }).join('')

  const lijst = (arr, max) => arr.slice(0, max).map(x => `<code>${escHtml(x)}</code>`).join(', ') + (arr.length > max ? ` and ${arr.length - max} more` : '')
  const skip = cov.skipped
  const skipTxt = Object.entries(skip).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'
  const subTxt = cov.submodules.declared === 0 ? 'none declared'
    : `${cov.submodules.declared} declared, ${cov.submodules.fetched.length} fetched` +
      (cov.submodules.failed.length ? `, ${cov.submodules.failed.length} could not be fetched` : '') +
      (cov.submodules.skipped.length ? `, ${cov.submodules.skipped.length} not fetched on purpose (dependencies or unsafe address)` : '')

  const coverageHtml = `
<h2>Coverage</h2>
<div class="coverage">
  <p><strong>${cov.analysedPct}% of the in-scope Solidity was read by the analysis</strong>: ${Math.round(cov.analysedBytes / 1024)} KB of ${Math.round(cov.scopeBytes / 1024)} KB, in ${cov.chunksAnalysed} of ${cov.chunksPlanned} planned parts${cov.deadlineHit ? ' (stopped at the time limit)' : ''}.</p>
  <p>Files read in full: ${cov.filesFull} of ${cov.scopeFiles}${cov.filesPartial.length ? `; partly read: ${lijst(cov.filesPartial, 15)}` : ''}.</p>
  ${cov.notAnalysedFiles.length ? `<p>Not read: ${lijst(cov.notAnalysedFiles, 40)}.</p>` : ''}
  <p>Left out as not the project's own logic: ${escHtml(skipTxt)}. Submodules: ${escHtml(subTxt)}.</p>
  ${cov.droppedHypotheses ? `<p>${cov.droppedHypotheses} hypothesis(es) were dropped because they named a file or function that is not in the code that was read.</p>` : ''}
</div>`

  const findingsHtml = findings.length === 0
    ? `<div class="no-findings"><strong>No hypotheses came out of the ${cov.analysedPct}% of the code that was read.</strong><br>This does not mean the code is safe, and it says nothing about the ${100 - cov.analysedPct}% that was not read.</div>`
    : findings.map(f => `
    <div class="finding" style="border-left-color:${SCOLOR[f.severity] ?? '#6b7280'}">
      <div class="finding-header">
        <span class="badge" style="background:${SCOLOR[f.severity] ?? '#6b7280'}">${f.severity ?? 'Info'}</span>
        <h3>${escHtml(f.title ?? 'Unknown')}</h3>
        <span class="conf">Model confidence: ${Math.round((f.confidence ?? 0.5) * 100)}%</span>
      </div>
      <div class="finding-body">
        ${f.file ? `<p><strong>File:</strong> <code>${escHtml(f.file)}</code></p>` : ''}
        ${f.function ? `<p><strong>Function:</strong> <code>${escHtml(f.function)}</code></p>` : ''}
        ${f.category ? `<p><strong>Category:</strong> ${escHtml(f.category)}</p>` : ''}
        <p>${escHtml(f.description ?? '').replace(/\n/g, '<br>')}</p>
        ${f.attackPath ? `<p><strong>Attack path:</strong> ${escHtml(f.attackPath).replace(/\n/g, '<br>')}</p>` : ''}
        ${f.impact ? `<p><strong>Impact:</strong> ${escHtml(f.impact)}</p>` : ''}
        ${f.recommendation ? `<p><strong>Recommendation:</strong> ${escHtml(f.recommendation)}</p>` : ''}
      </div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bug Bounty Intelligence — ${escHtml(repo)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:900px;margin:0 auto}
.header{border-bottom:1px solid #1e3a5f;padding-bottom:1.5rem;margin-bottom:2rem}
h1{font-size:1.8rem;color:#38bdf8}
.meta{color:#94a3b8;font-size:0.9rem;margin-top:0.4rem}
.stats{display:flex;gap:1rem;margin:1rem 0 2rem;flex-wrap:wrap}
.stat{background:#1e293b;border-radius:8px;padding:.75rem 1.25rem;display:flex;align-items:center;gap:.75rem}
.count{font-size:1.5rem;font-weight:bold}
.badge{padding:.25rem .6rem;border-radius:4px;font-size:.8rem;font-weight:bold;color:#fff}
.finding{background:#1e293b;border-radius:8px;margin-bottom:1rem;border-left:4px solid #1e3a5f;overflow:hidden}
.finding-header{padding:1rem 1.5rem;display:flex;align-items:center;gap:1rem}
.finding-header h3{flex:1;font-size:1rem}
.conf{font-size:.8rem;color:#94a3b8}
.finding-body{padding:0 1.5rem 1.25rem;border-top:1px solid #0f172a}
.finding-body p{margin-top:.75rem;line-height:1.6;color:#cbd5e1}
code{background:#0f172a;padding:.1rem .4rem;border-radius:3px;font-size:.85rem}
.no-findings{padding:2rem;text-align:center;color:#cbd5e1;background:#1e293b;border-radius:8px;line-height:1.7}
.coverage{margin-bottom:2rem;padding:1rem 1.25rem;background:#1e293b;border-radius:8px;border-left:4px solid #38bdf8;font-size:.9rem;line-height:1.7;color:#cbd5e1}
.coverage p{margin-top:.5rem}
.limits{margin-bottom:1rem;padding:.75rem 1.25rem;background:#1e3a5f;border-radius:8px;border-left:4px solid #ca8a04;font-size:.85rem;color:#fbbf24}
h2{font-size:1.1rem;margin-bottom:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
.disclaimer{margin-top:3rem;padding:1.5rem;background:#1e293b;border-radius:8px;border-left:4px solid #ca8a04;font-size:.85rem;color:#94a3b8;line-height:1.7}
</style>
</head>
<body>
<div class="header">
  <h1>Bug Bounty Intelligence</h1>
  <div class="meta">AI-generated hypotheses for Solidity code. Not an audit.</div>
  <div class="meta">Repository: <code>${escHtml(repo)}</code></div>
  <div class="meta">Analyzed: ${ts} &nbsp;|&nbsp; Model: ${escHtml(modelNamen)} &nbsp;|&nbsp; Duration: ${Math.round(durationMs / 1000)}s</div>
</div>

${coverageHtml}

<h2>Summary</h2>
<div class="stats">${statsHtml}</div>

<h2>Hypotheses</h2>
<div class="limits">These are unverified AI hypotheses, not confirmed vulnerabilities. Check each one by hand before you act on it. How often this scan finds known issues in closed audit contests, including the misses, is published in the repository linked below.</div>
${findingsHtml}

<div class="disclaimer">
<strong>Disclaimer:</strong> This report was produced by an automated pipeline that prompts a language model with parts of your code (model: ${escHtml(modelNamen)}).
It is not a security audit, a certification or an approval. It can miss real issues and can include false ones. No warranty is provided.
<br><br>
If this report did not help you, or you think it is wrong, write to <a href="mailto:info@holistischadviseur.nl?subject=Bug%20Bounty%20Intelligence%20${escHtml(jobId)}" style="color:#38bdf8">info@holistischadviseur.nl</a> with the job id <code>${escHtml(jobId)}</code>. You can ask for a new attempt or a refund.
<br><br>
Method, limits and test results: <a href="https://github.com/holistis/bug-bounty-intelligence-mcp" style="color:#38bdf8">github.com/holistis/bug-bounty-intelligence-mcp</a>
&nbsp;|&nbsp; Official sources: <a href="https://tokenizen.nl/notes/official-sources" style="color:#38bdf8">tokenizen.nl/notes/official-sources</a>
</div>
</body>
</html>`
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ===== HOOFDLOGICA =====
const startTs = Date.now()
console.log(`[runner] Start job ${jobId} | model: ${MODEL} | runner v2`)

let tmpDir = null

try {
  // 1. Laad job
  const job = readJob(jobId)
  if (!job) throw new JobFout('onbekend', `Job ${jobId} niet gevonden in queue`)
  if (job.status !== 'queued') throw new JobFout('onbekend', `Job heeft status '${job.status}', verwacht 'queued'`)

  const repo = job.repo
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new JobFout('repo-niet-gevonden', `Ongeldig repo-formaat: ${repo}`)
  console.log(`[runner] Repo: ${repo}`)

  // 2. Mark processing
  updateJob({ status: 'processing' })

  // 3. Warm-up (alleen als er geen cloud-bron is)
  await ollamaWarmup()

  // 4. Clone, met submodules
  tmpDir = `/tmp/bug-intel-${jobId}`
  spawnSync('rm', ['-rf', tmpDir])
  console.log(`[runner] Clone https://github.com/${repo} ...`)
  const submodules = kloonRepo(repo, tmpDir)
  console.log(`[runner] Clone OK | submodules: ${submodules.declared} gemeld, ${submodules.fetched.length} opgehaald, ${submodules.failed.length} mislukt, ${submodules.skipped.length} bewust overgeslagen`)

  // 5. Scope: wat telt mee, in welke volgorde, in welke stukken
  const { files, overgeslagen } = scanScope(tmpDir)
  if (files.length === 0) {
    const gebruikt = Object.entries(overgeslagen).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ')
    const subHint = submodules.failed.length ? ` ${submodules.failed.length} submodule(s) could not be fetched.` : (submodules.declared > submodules.fetched.length ? ' Dependency submodules are not fetched.' : '')
    throw new JobFout('geen-solidity', `no in-scope Solidity found (left out: ${gebruikt || 'nothing'}).${subHint}`)
  }
  const scopeBytes = files.reduce((a, f) => a + f.text.length, 0)
  const plan = planChunks(files, { chunkChars: CHUNK_CHARS, maxChunks: MAX_CHUNKS })
  console.log(`[runner] Scope: ${files.length} bestanden, ${Math.round(scopeBytes / 1024)} KB | ${plan.chunks.length} stukken gepland, ${plan.notAnalysed.length} delen buiten de cap | links gelaten: ${JSON.stringify(overgeslagen)}`)

  const fileNames = files.map(f => f.rel)
  const topTekst = chunkTekst(plan.chunks[0])
  const protocolType = detectProtocolType(fileNames, topTekst)
  console.log(`[runner] Protocol-type: ${protocolType}`)

  // 6. Fase 1 — contract begrip + threat model (op het hoogst gerangschikte stuk)
  const patternHints = loadPatternHints()
  console.log('[runner] Fase 1: contract begrip...')
  const phase1 = await askLLMSterk(
    `You are analyzing a Solidity smart contract codebase for security vulnerabilities.
Repository: ${repo}
In-scope files (${fileNames.length} total, highest-risk first): ${[...files].sort((a, b) => b.score - a.score).slice(0, 25).map(f => f.rel).join(', ')}${patternHints}

CONTRACT SOURCE (the highest-risk files):
${topTekst.slice(0, 15_000)}

Provide a concise structured understanding:
1. What does this protocol do? (2-3 sentences)
2. Key contracts and their roles (bullet list)
3. Trust model: who are the trusted actors (owner/governance/admin/multisig)?
4. External interactions (other protocols, oracles, tokens called externally)
5. Main asset flows (what moves where)`,
    'You are an expert smart contract security auditor. Be concise and factual.',
    3, 40_000, { alleenSterk: true, deadline: startTs + JOB_BUDGET_MS + 4 * 60_000 }
  ).catch(e => { throw new JobFout('tijdelijk', `no strong analysis source was available for phase 1: ${String(e.message).slice(0, 80)}`) })

  // 7. Fase 2 — kwetsbaarheid jacht, stuk voor stuk, alleen met sterke bronnen
  const typeVectors = getTypeAttackVectors(protocolType)
  const ilmHints    = load3ilmHints(protocolType)
  const anderen     = fileNames.slice(0, 60).join(', ')

  const fase2Prompt = (chunk, i, n) => `You are performing a security audit using the Al-Mizaan framework.

PROTOCOL UNDERSTANDING:
${phase1}

CONTRACT SOURCE (part ${i} of ${n} of the code that is being read, ${Math.round(chunk.chars / 1024)}KB). Only this part is shown; report only what you can point to in the code below:
${chunkTekst(chunk)}

OTHER IN-SCOPE FILES (names only, not shown): ${anderen}${patternHints}${ilmHints}${typeVectors}

Hunt for vulnerabilities across these invariant categories:
- SOLVENCY: Can the protocol become insolvent? Can funds be drained by untrusted callers?
- ACCOUNTING: Incorrect balance tracking? Integer overflow? Rounding errors that accumulate?
- ACCESS: Missing permission checks that untrusted callers can bypass?
- LIVENESS: Can the protocol be permanently griefed or frozen by untrusted callers?
- ORDERING: Reentrancy? Dangerous cross-function state? Flash loan manipulation?
- SETTLEMENT: Oracle manipulation? Stale price data? Price/rate manipulation?

Output each finding in this EXACT format:
---FINDING---
TITLE: [short descriptive title, max 80 chars]
SEVERITY: [Critical/High/Medium/Low/Info]
CATEGORY: [SOLVENCY/ACCOUNTING/ACCESS/LIVENESS/ORDERING/SETTLEMENT]
FILE: [filename.sol, exactly as in a FILE marker above]
FUNCTION: [functionName() that exists in the code above — leave blank if contract-wide]
DESCRIPTION: [2-4 sentences describing the vulnerability clearly]
ATTACK_PATH: [step-by-step how an untrusted attacker exploits this]
IMPACT: [concrete damage: fund loss, protocol halt, etc.]
RECOMMENDATION: [how to fix in 1-2 sentences]
CONFIDENCE: [0.0-1.0]
---END---

STRICT RULES — violations cause rejection:
- The attacker MUST be an untrusted external caller (not owner/admin/governance — those are trusted)
- Do NOT report deployer misconfiguration
- Do NOT report theoretical issues without a concrete attack path
- Name only files and functions that appear in the code above
- CONFIDENCE below 0.4: do not include
- Maximum 8 findings total
- If you find nothing that meets these rules, output nothing`

  const SYS2 = 'You are an expert smart contract security auditor. Apply the Al-Mizaan framework rigorously. Avoid false positives.'
  const gebruiktBron = new Set()
  const geslaagd = []        // stukken die door een sterke bron zijn gelezen
  const mislukt = []         // stukken zonder antwoord van een sterke bron
  const ruw = []
  let verworpen = 0
  let deadlineHit = false

  const draaiStuk = async (chunk, i, n, opties = {}) => {
    // De watcher markeert een job na 45 minuten als vastgelopen; een enkel stuk mag het budget dus
    // met hooguit een paar minuten overschrijden, nooit met een uur.
    const tekst = await askLLMSterk(fase2Prompt(chunk, i, n), SYS2, 3, 40_000, { alleenSterk: true, deadline: startTs + JOB_BUDGET_MS + 4 * 60_000, ...opties })
    const bron = LAATSTE_BRON
    if (!STERKE_BRONNEN.includes(bron?.naam)) throw new Error(`antwoord van zwakke bron (${bron?.naam})`)
    gebruiktBron.add(`${bron.model} (${bron.naam})`)
    const uit = []
    for (const f of parseFindings(tekst)) {
      const probleem = wijstNaarEchteCode(f, chunk)
      if (probleem) { verworpen++; console.log(`[runner] hypothese verworpen (${probleem}): ${String(f.title).slice(0, 60)}`); continue }
      uit.push(f)
    }
    return { uit, bronNaam: bron.naam }
  }

  console.log(`[runner] Fase 2: ${plan.chunks.length} stuk(ken)...`)
  const gebruikteNamen = []
  for (let i = 0; i < plan.chunks.length; i++) {
    if (Date.now() - startTs > JOB_BUDGET_MS) { deadlineHit = true; mislukt.push(...plan.chunks.slice(i)); console.warn('[runner] Tijdsbudget op, rest niet geanalyseerd'); break }
    try {
      const r = await draaiStuk(plan.chunks[i], i + 1, plan.chunks.length)
      ruw.push(...r.uit); geslaagd.push(plan.chunks[i]); gebruikteNamen.push(r.bronNaam)
      console.log(`[runner] stuk ${i + 1}/${plan.chunks.length}: ${r.uit.length} hypothese(s) via ${r.bronNaam}`)
    } catch (e) {
      mislukt.push(plan.chunks[i])
      console.warn(`[runner] stuk ${i + 1}/${plan.chunks.length} niet geanalyseerd: ${String(e.message).slice(0, 120)}`)
    }
  }
  if (geslaagd.length === 0) throw new JobFout('tijdelijk', 'no strong analysis source was available for any part of the code')

  // 8. Niets gevonden? Eén tweede poging met een andere sterke bron op de twee hoogste stukken.
  if (ruw.length === 0) {
    console.log('[runner] Geen hypotheses: tweede poging met een andere sterke bron...')
    for (const chunk of geslaagd.slice(0, 2)) {
      if (Date.now() - startTs > JOB_BUDGET_MS) { deadlineHit = true; break }
      try {
        const r = await draaiStuk(chunk, plan.chunks.indexOf(chunk) + 1, plan.chunks.length, { overslaan: [...new Set(gebruikteNamen)] })
        ruw.push(...r.uit)
      } catch (e) { console.warn(`[runner] tweede poging mislukt: ${String(e.message).slice(0, 100)}`) }
    }
  }

  // 9. Ontdubbelen en kiezen
  const dedup = new Map()
  for (const f of ruw) {
    const sleutel = `${String(f.file).split(/[\\/]/).pop().toLowerCase()}|${String(f.title).toLowerCase().replace(/\W+/g, ' ').trim()}`
    if (!dedup.has(sleutel) || dedup.get(sleutel).confidence < f.confidence) dedup.set(sleutel, f)
  }
  const validated = [...dedup.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 12)
  const outcome = validated.length > 0 ? 'hypotheses' : 'no_hypotheses'
  console.log(`[runner] ${validated.length} hypotheses na ontdubbelen (${ruw.length} ruw, ${verworpen} verworpen op verzonnen bestand of functie) | uitkomst: ${outcome}`)

  // 10. Dekking: eerlijk tellen wat het model echt te zien kreeg
  const gelezen = new Map()   // rel -> bytes gelezen
  for (const c of geslaagd) for (const p of c.parts) gelezen.set(p.rel, (gelezen.get(p.rel) ?? 0) + p.text.length)
  const analysedBytes = [...gelezen.values()].reduce((a, b) => a + b, 0)
  const filesFull = files.filter(f => (gelezen.get(f.rel) ?? 0) >= f.text.length - 64).length
  const filesPartial = files.filter(f => (gelezen.get(f.rel) ?? 0) > 0 && (gelezen.get(f.rel) ?? 0) < f.text.length - 64).map(f => f.rel)
  const notAnalysedFiles = files.filter(f => !gelezen.has(f.rel)).map(f => f.rel)
  const cov = {
    scopeFiles: files.length, scopeBytes, analysedBytes,
    analysedPct: scopeBytes ? Math.min(100, Math.round(analysedBytes / scopeBytes * 100)) : 0,
    chunksPlanned: plan.chunks.length, chunksAnalysed: geslaagd.length,
    filesFull, filesPartial, notAnalysedFiles,
    skipped: overgeslagen, submodules, droppedHypotheses: verworpen, deadlineHit,
  }
  console.log(`[runner] Dekking: ${cov.analysedPct}% (${Math.round(analysedBytes / 1024)} van ${Math.round(scopeBytes / 1024)} KB), ${filesFull}/${files.length} bestanden volledig`)

  // 11. Rapport
  const durationMs = Date.now() - startTs
  mkdirSync(REPORTS_DIR, { recursive: true })
  const modelNamen = [...gebruiktBron].join(', ')
  const reportHtml = buildHtml(repo, validated, modelNamen, durationMs, cov, outcome)

  // 12. Kwaliteitspoort: elk gelezen stuk kwam van een sterke bron (afgedwongen in draaiStuk).
  console.log(`[runner] Kwaliteitspoort OK — gelezen door ${modelNamen}`)

  console.log('[runner] Rapport aflevereren...')
  const deliverResp = await fetch(ADMIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
    body: JSON.stringify({ jobId, reportHtml, outcome, coverage: { pct: cov.analysedPct, analysedKb: Math.round(analysedBytes / 1024), scopeKb: Math.round(scopeBytes / 1024), filesRead: filesFull + filesPartial.length, scopeFiles: files.length } }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!deliverResp.ok) {
    const body = await deliverResp.text().catch(() => '')
    throw new JobFout('tijdelijk', `Admin endpoint fout ${deliverResp.status}: ${body}`.slice(0, 200))
  }
  console.log('[runner] Rapport afgeleverd!')

  // 13. Leer-log
  const highCrit = validated.filter(f => ['Critical', 'High'].includes(f.severity)).length
  appendFileSync(LEARNING, JSON.stringify({
    jobId, repo, model: modelNamen, runner: 'v2', durationMs,
    filesAnalyzed: files.length, coveragePct: cov.analysedPct, outcome,
    findingsRaw: ruw.length, findingsValidated: validated.length, droppedHypotheses: verworpen,
    highCritical: highCrit, protocolType,
    findings: validated.map((f, i) => ({ id: i, title: f.title, severity: f.severity, category: f.category, confidence: f.confidence })),
    ts: Date.now(),
  }) + '\n')

  // 14. Telegram
  const dur = Math.round(durationMs / 1000)
  await tg(
    `<b>✅ Bug Intel klaar (${outcome})</b>\nRepo: <code>${repo}</code>\n` +
    `Hypotheses: ${validated.length} (${highCrit} High/Critical) | dekking ${cov.analysedPct}%\n` +
    `Duur: ${dur}s | Model: ${modelNamen}`
  )
  console.log(`[runner] Klaar in ${dur}s — ${validated.length} hypotheses (${highCrit} H/C), dekking ${cov.analysedPct}%`)

} catch (err) {
  const klasse = err instanceof JobFout ? err.klasse : 'onbekend'
  console.error(`[runner] FOUT (${klasse}):`, err.message)
  try { updateJob({ status: 'failed', error: String(err.message).slice(0, 200), errorClass: klasse }) } catch {}
  await tg(`<b>❌ Bug Intel FOUT</b>\nJob: <code>${jobId}</code>\nKlasse: ${klasse}\n${String(err.message).slice(0, 200)}`)
  process.exit(1)

} finally {
  if (tmpDir) {
    try { spawnSync('rm', ['-rf', tmpDir]) } catch {}
  }
}
