// Real smoke test, not a placeholder: spawns the actual MCP server over stdio (the same
// transport a real client uses, including the one published to npm) and calls it for real.
// Exists so the publish workflow has something true to gate on before anything goes out,
// and so a future data-refresh that breaks the server's shape fails loudly here first.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const rates = JSON.parse(readFileSync(new URL('../vulnerability-acceptance-rates.json', import.meta.url), 'utf8'))

const transport = new StdioClientTransport({ command: 'node', args: ['index.mjs'] })
const client = new Client({ name: 'smoke-test', version: '0.0.1' }, { capabilities: {} })
await client.connect(transport)

try {
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name).sort()
  assert.deepEqual(names, ['get_scan_report', 'list_vulnerability_patterns', 'scan_contract'], 'de server biedt precies deze drie tools aan')

  const r = await client.callTool({ name: 'list_vulnerability_patterns', arguments: { protocol_type: 'LENDING' } })
  const text = r.content[0].text
  assert.match(text, /accepted \(\d+ cases\)/, 'het antwoord bevat echte, geen placeholder-cijfers')

  // Interne consistentie: elk patroon in het gepubliceerde vulnerability-acceptance-rates.json
  // moet op zichzelf kloppen (de les van 12 nov 2026: een getal dat niet eens intern klopt,
  // is geen bewezen getal).
  for (const [pattern, stats] of Object.entries(rates.patterns)) {
    assert.ok(stats.accepted <= stats.total, `${pattern}: accepted (${stats.accepted}) mag nooit groter zijn dan total (${stats.total})`)
    assert.ok(stats.total > 0, `${pattern}: total moet groter dan 0 zijn`)
  }
  const somTotal = Object.values(rates.patterns).reduce((s, p) => s + p.total, 0)
  assert.ok(somTotal > 0, 'er staat echte data in vulnerability-acceptance-rates.json')
  assert.equal(rates.contests_included > 0, true, 'contests_included moet een echt, positief getal zijn')

  console.log(`OK: ${tools.length} tools, ${Object.keys(rates.patterns).length} patronen, ${rates.contests_included} wedstrijden, ${rates.total_findings} meldingen`)
} finally {
  await client.close()
}
