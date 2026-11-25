// Echte end-to-end proef (geen mock): spawnt de stdio MCP-server en roept
// scan_contract aan tegen de LEVENDE backend (x402.tokenizen.nl), die altijd
// al een echte 402 teruggeeft voor een onbetaalde aanvraag. Bevestigt dat het
// de betaaleis het x402 MCP-transport volgt: isError true, structuredContent en dezelfde JSON in content[0].
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

  const result = res.result
  if (result?.isError !== true) {
    throw new Error(`een onbetaalde aanvraag moet isError true geven (x402 MCP-transport): ${JSON.stringify(result)}`)
  }
  const content = result.content
  if (!Array.isArray(content) || content.length !== 1) {
    throw new Error(`verwacht precies 1 content-item met de betaaleis als JSON, kreeg ${content?.length ?? 0}: ${JSON.stringify(result)}`)
  }
  if (/Pay to|After paying|then retry/i.test(content[0].text)) {
    throw new Error(`de tekst nodigt uit tot een handmatige overmaking, die de API niet aan een scan kan koppelen: ${content[0].text}`)
  }

  let challenge
  try {
    challenge = JSON.parse(content[0].text)
  } catch (e) {
    throw new Error(`content[0] is geen geldige JSON: ${content[0].text}`)
  }
  if (JSON.stringify(challenge) !== JSON.stringify(result.structuredContent)) {
    throw new Error('structuredContent en content[0].text moeten hetzelfde object zijn')
  }
  if (typeof challenge.x402Version !== 'number') {
    throw new Error(`x402Version ontbreekt of is geen nummer: ${JSON.stringify(challenge)}`)
  }
  if (!Array.isArray(challenge.accepts) || challenge.accepts.length === 0) {
    throw new Error(`accepts ontbreekt of is leeg: ${JSON.stringify(challenge)}`)
  }

  console.log('OK: tools/call op scan_contract (onbetaald) geeft een foutresultaat met de betaaleis als structuredContent en JSON')
  console.log(`    x402Version=${challenge.x402Version}, accepts[0].amount=${challenge.accepts[0]?.amount}`)
} finally {
  proc.kill()
}
