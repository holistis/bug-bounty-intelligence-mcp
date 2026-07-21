# Bug Bounty Intelligence — MCP Server

AI-powered smart contract security analysis for AI agents and developers.

**Drawn from a corpus of 27,681 submitted findings across 105 Sherlock and Code4rena contests.**
**Cost: $5 USDC on Base (eip155:8453) via x402.**
**Free tool: `list_vulnerability_patterns` — no payment needed.**

`list_vulnerability_patterns`' acceptance-rate numbers are computed only from the subset where
results could be exactly reconciled against Sherlock's own published outcomes — 1,032 findings
across 10 contests. We'd rather show fewer, verified numbers than a bigger set we can't stand
behind. See [METHODOLOGY.md](METHODOLOGY.md) for exactly why, and how to reproduce it.

## Benchmark: vs Slither

**[See the full benchmark →](BENCHMARK.md)**

On 3FLabs/grunt (ERC-4626 + Morpho vaults, 218 contracts): Slither reports 27 "High" findings. After analysis: 24 are in `lib/solady` (out-of-scope dependency with known Slither false positive patterns), and 3 are EIP-712 design patterns. False positive rate: **100%**.

Bug Bounty Intelligence scopes to `src/` only and filters through the Al-Mizaan 7-gate framework before reporting anything.

## What it does

Submit a public GitHub repo containing Solidity smart contracts. Receive a full vulnerability report within 24 hours, powered by the Al-Mizaan v3 analysis framework.

## Tools

| Tool | Description | Cost |
|------|-------------|------|
| `scan_contract` | Submit repo for security analysis | $5 USDC |
| `get_scan_report` | Poll status and get report URL | Free |
| `list_vulnerability_patterns` | Show acceptance rates from exact-reconciled Sherlock contests | Free |

## Quick start (Claude Desktop / Claude Code)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bug-bounty-intelligence": {
      "command": "npx",
      "args": ["-y", "bug-bounty-intelligence-mcp@latest"]
    }
  }
}
```

Or run directly:

```bash
npx -y bug-bounty-intelligence-mcp@latest
```

## Payment

If `scan_contract` returns `PAYMENT REQUIRED`, send exactly $5 USDC on Base to the address shown, then retry. Payment = acceptance of [service terms](https://wazir-x402.duckdns.org/terms).

**x402 info:**
- Network: Base mainnet (eip155:8453)
- Amount: 5,000,000 (= 5 USDC, 6 decimals)
- Asset: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (USDC)
- Wallet: 0xdffcC75a674257be6FE1b5549FE52e8f8a6A3A5A

## Example session

```
> list_vulnerability_patterns({ protocol_type: "LENDING" })

Vulnerability patterns for LENDING protocols (from Sherlock audit findings, exact-reconciled contests only):

oracle-manipulation      36% accepted (131 cases)
liquidation              29% accepted (14 cases)
staleness                49% accepted (174 cases)
rounding                 40% accepted (63 cases)
flash-loan               46% accepted (13 cases)
access-control           47% accepted (74 cases)

> scan_contract({ repo_url: "https://github.com/myprotocol/contracts", protocol_type: "LENDING" })

PAYMENT REQUIRED to start the scan.

Amount:  5.00 USDC
Network: Base mainnet (eip155:8453)
Pay to:  0xdffcC75a674257be6FE1b5549FE52e8f8a6A3A5A
Asset:   USDC — 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

After paying, retry scan_contract with the same repo_url.
```

## Sample scan output

Real scan of `sherlock-audit/2025-03-crestal-network` (Derivatives protocol, 29 contracts):

```
Summary: 0 Critical  |  1 High  |  0 Medium  |  0 Low
Analyzed: 29 contracts  |  Model: qwen2.5:7b  |  Duration: 25min

FINDING #1 — HIGH
Title:    Owner Can Arbitrarily Set Payment Addresses
File:     Blueprint.sol
Functions: setCreateAgentTokenCost, setUpdateCreateAgentTokenCost,
           addPaymentAddress, removePaymentAddress
Category: ACCESS

Description:
  The owner can arbitrarily set payment addresses and costs without
  any external validation or timelock.

Attack path:
  An attacker with ownership calls setCreateAgentTokenCost or
  addPaymentAddress to modify fees or redirect user payments to
  an attacker-controlled wallet.

Impact:
  Extremely high costs (griefing) or redirection of user funds.

Recommendation:
  Implement a governance mechanism or timelock to restrict fee
  and address changes.

Confidence: 0.90 (CONFIRMED by Al-Mizaan validation)
```

## About the analysis

The Al-Mizaan v3 framework checks 7 gates:

1. Code reading (literal, not docs)
2. Reachability chain (entry to exploit)
3. Threat model (who can trigger it)
4. Invariant breach (what rule is violated)
5. Protocol intent (was this intended?)
6. Impact (real financial damage)
7. Formal proof (reproducible PoC)

Only findings that survive all 7 gates are reported.

## Service info

- **API endpoint**: https://wazir-x402.duckdns.org/api/bug-intel
- **Terms**: https://wazir-x402.duckdns.org/terms
- **Delivery**: within 24h
- **Source code**: deleted after analysis
