// Echte end-to-end proef (geen mock): spawnt de stdio MCP-server en roept
// scan_contract aan tegen de LEVENDE backend (x402.tokenizen.nl), die altijd
// al een echte 402 teruggeeft voor een onbetaalde aanvraag. Bevestigt dat het
// tweede content-item machine-leesbare x402-JSON is, niet alleen het eerste
// (door-mensen-leesbare) prozablok.
import { spawn } from 'node:child_process'

function rpc(proc, payload) {
  return new Promise((resolve, reject) => {
    let buf = ''
    const onData = (chunk) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id === payload.id) {
            proc.stdout.off('data', onData)
            resolve(msg)
            return
          }
        } catch {
          // nog geen volledige regel, wachten op meer data
        }
      }
    }
    proc.stdout.on('data', onData)
    proc.stdin.write(JSON.stringify(payload) + '\n')
    setTimeout(() => {
      proc.stdout.off('data', onData)
      reject(new Error('timeout, geen antwoord binnen 20s'))
    }, 20000)
  })
}

const proc = spawn('node', ['index.mjs'], { stdio: ['pipe', 'pipe', 'inherit'] })

try {
  await rpc(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } } })

  const res = await rpc(proc, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'scan_contract', arguments: { repo_url: 'https://github.com/Uniswap/v2-core' } },
  })

  const content = res.result?.content
  if (!Array.isArray(content) || content.length < 2) {
    throw new Error(`verwacht 2 content-items, kreeg ${content?.length ?? 0}: ${JSON.stringify(res.result)}`)
  }

  const prose = content[0].text
  if (!prose.includes('PAYMENT REQUIRED')) {
    throw new Error(`eerste item mist de door-mensen-leesbare proza-tekst: ${prose}`)
  }

  const challengeText = content[1].text
  let challenge
  try {
    challenge = JSON.parse(challengeText)
  } catch (e) {
    throw new Error(`tweede item is geen geldige JSON: ${challengeText}`)
  }
  if (typeof challenge.x402Version !== 'number') {
    throw new Error(`x402Version ontbreekt of is geen nummer: ${JSON.stringify(challenge)}`)
  }
  if (!Array.isArray(challenge.accepts) || challenge.accepts.length === 0) {
    throw new Error(`accepts ontbreekt of is leeg: ${JSON.stringify(challenge)}`)
  }

  console.log('OK: tools/call op scan_contract (onbetaald) geeft nu ook een machine-leesbare x402-JSON terug')
  console.log(`    x402Version=${challenge.x402Version}, accepts[0].amount=${challenge.accepts[0]?.amount}`)
} finally {
  proc.kill()
}
