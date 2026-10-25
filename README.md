# Bug Bounty Intelligence: MCP Server

AI-powered smart contract security analysis for AI agents and developers.

## Update, 25 October 2026, night: a quick scan for 1 dollar

There are now two prices. The quick scan, POST https://x402.tokenizen.nl/api/bug-intel-quick for 1 USDC on Base, returns the 15 hypotheses the model is most confident about. The full scan, POST https://x402.tokenizen.nl/api/bug-intel for 5 USDC, adds 15 more with lower confidence. It is the same engine and the same kind of report. The hit rates we measured (8 of 105 and 5 of 66) are for the first 15 hypotheses, so they are the numbers of the quick scan; the second list is the extra of the full scan. The quick scan costs exactly 1 dollar because the official x402 client refuses payments above 1 dollar per request unless its owner raises the limit, and we checked with a real purchase that an agent with default settings can buy it: [results/2026-10-25-v31/quick-scan-purchase/README.md](results/2026-10-25-v31/quick-scan-purchase/README.md). Both routes sign their offers.

## Update, 25 October 2026, night: a standard x402 client can now buy the scan

Until today the scan endpoint accepted only a transaction hash from a payment you had made by hand, and it answered 400 to the signed authorization that standard x402 clients send, although its 402 answer said that would work. That is fixed. A standard client (@x402/fetch 2.28.0) bought the scan from a throwaway address, got the receipt in the response, and the six checks on the receipt pass: [results/2026-10-25-v31/standard-client-purchase/README.md](results/2026-10-25-v31/standard-client-purchase/README.md). It was a self test with our own money, one purchase. One thing a buyer needs to know: the official client refuses payments above 1 dollar per request unless its owner raises the limit, and the scan costs 5 dollars.

## Update, 25 October 2026, night: the scan on contests from the last year

We ran the scan once on 9 Code4rena contests from September 2025 to March 2026 (66 known High and Medium findings), with the rule for reading the result written beforehand. The first 15 hypotheses of a report held 5 of the 66 (7.6 percent) and the first 30 held 8 (12.1 percent). That is the same rate as on the 8 Sherlock contests, so by our own rule the result holds on newer contests. It is still a low rate: 58 of the 66 known findings were not in the first 15. Numbers, judgements, the whole lists and the limits: [results/2026-10-25-c4-fresh/README.md](results/2026-10-25-c4-fresh/README.md).

A report can now show up to 30 hypotheses, in two lists: the 15 the model is most confident about and 15 more with lower confidence. On the stored lists the second list held 8 known findings that the first list did not (5 on Sherlock, 3 on Code4rena), at a slightly lower precision. We chose this after seeing the numbers, so it is a product choice and not a pre-registered test.

## Update, 25 October 2026, evening: the offer is signed

The paid endpoint now declares the x402 offer-receipt extension and signs its offer. You can check it yourself without paying: `npx -y agent-receipt-verify https://x402.tokenizen.nl/api/bug-intel` reaches level 2 (asks for payment the way x402 says, declares the extension, and the signature of the offer verifies). The signer is 0xf30b0706E78b3166745E6a2f351992321088058f. That key only signs offers and receipts and holds no funds. The key is bound to the service domain in DNS, the way section 4.5.1 of the offer-receipt specification describes: `dig TXT _controllers.x402.tokenizen.nl` lists it as a controller (set on 25 October 2026). The address that receives payments is the one in the payment section below.

After a payment the answer to the paid request carries a signed receipt for that payment transaction, in the body as `receipt` and in the `PAYMENT-RESPONSE` header (level 3). We have seen this on one real payment, a self test on Base mainnet with 5.1 USDC from the project's own address to the payment address of the service. The receipt, the transaction, the delivered report and a script that checks all of it are in [results/2026-10-25-v31/first-real-payment/](results/2026-10-25-v31/first-real-payment/README.md). Nobody else has used the receipt yet, and the conformance checker still shows level 3 as not measured because it checks without paying. A receipt says that our service saw payment transaction X for this resource. It says nothing about how good the report is.

## Update, 25 October 2026: version 3.1 is live

Paid scans now run on a newer version, V3.1. On the same 8 contests as the sealed run it found 8 of 105 known High and Medium findings (7.6 percent), against 4 for the version before it and 1 for the scan that was in production until the evening of 25 October: [results/2026-10-25-v31/README.md](results/2026-10-25-v31/README.md). Two things changed at once and those contests are no longer secret, so this is a doubling from a low level and not a proof. 97 of the 105 were still not found. A scan takes about 20 to 45 seconds and costs us 0.02 to 0.15 dollar. The earlier version stays in place as the fallback.

## Update, 24 October 2026, evening: the sealed run

The one run on the sealed set is done, with the rule written before it: [results/2026-10-24-sealed/README.md](results/2026-10-24-sealed/README.md). On 8 contests that nobody here had run anything on, the scan as it runs today found 1 of 105 known High and Medium findings. A newer version, not in production, found 4 of 105. The rule needed at least 5 findings that production does not find, and it found 3, so production stays as it is. The scan still produces hypotheses to review by hand, and it has not been shown to find what a human audit finds.

## Update, 24 October 2026, later the same day: version 2 of the scan

The defects described below were fixed and the new version is live. What changed: git submodules are fetched when they point to github.com, tests, mocks, scripts, interfaces and vendored libraries are left out, files are ranked by how likely they move funds and sent in at most six parts, every report states how much of the in-scope code was read, a scan without hypotheses is delivered as such and not as a normal report, hypotheses that name files or functions that are not in the code are dropped, and file links inside a repository are never followed. A free precheck at https://x402.tokenizen.nl/api/bug-intel/precheck?repo=owner/name says before you pay whether the scan counts any Solidity in your repository and roughly how much of it will be read.

The measurement of this version was pre-registered before it ran: [PREREGISTRATION-v2-2026-10-24.md](PREREGISTRATION-v2-2026-10-24.md). The frozen files are in [pipeline/v2](pipeline/v2).

Result, in [RESULTS-v2-2026-10-24.md](RESULTS-v2-2026-10-24.md): none of the 40 known High and Medium findings was found, 0 of 31 on the four contests of the first run and 0 of 9 on three new contests, while 29 percent of the in-scope code was read (8 to 100 percent per contest). 15 of the 40 known findings sit in a file that was read, and none of those was found. The scan produces hypotheses to review by hand. It has not been shown to find the issues that audit contests reward.

## Correction and limits (24 October 2026, before version 2)

Reading the production scan code on 24 October 2026 showed that earlier text on this page overstated what the paid scan does. What it does today:

- It sends the model at most about 22,000 characters of Solidity source per job, taken from up to 60 files in directory order, and it does not skip test or mock folders. On three recent audit-contest repositories (code-423n4/2025-11-merkl, 2025-11-sukukfi and 2026-04-monetrix) that is 3 to 7 percent of the Solidity source.
- The 7-gate filter is not part of the paid scan. It was taken out because the small model also eliminated real bugs. The report lists raw hypotheses with a self-reported confidence of 0.4 or higher, at most eight, and its disclaimer says so.
- The sample below ran on a repository that belongs to the corpus the framework was built from. It does not show how the scan does on projects it has not seen, and its label "CONFIRMED by Al-Mizaan validation" does not apply to the scan as it runs today.
- We have not measured how many real bugs the scan finds on contests it has not seen. A test on closed audit contests is pre-registered in [PREREGISTRATION-2026-10-24.md](PREREGISTRATION-2026-10-24.md). The baseline ran on 24 October 2026: 0 of 31 findings found, 2 hypotheses reported and neither matches, one job failed and two reports were empty. See [RESULTS-2026-10-24.md](RESULTS-2026-10-24.md). Until a changed version is pre-registered and measured, do not read this scan as something that finds bugs on projects it has not seen.

Official source: this repository and the payment address in the payment section below are the only official ones for Bug Bounty Intelligence. If a listing, a reply or a website gives a different payment address, it is not ours. Check the address against the one below before you pay.

**Drawn from a corpus of 27,681 submitted findings across 105 Sherlock and Code4rena contests.**
**Cost: $5 USDC on Base (eip155:8453) via x402 for the full scan, $1 USDC for the quick scan.**
**Free tool: `list_vulnerability_patterns`, no payment needed.**

`list_vulnerability_patterns`' acceptance-rate numbers are computed only from the subset where
results could be exactly reconciled against Sherlock's own published outcomes: 1,032 findings
across 10 contests. We'd rather show fewer, verified numbers than a bigger set we can't stand
behind. See [METHODOLOGY.md](METHODOLOGY.md) for exactly why, and how to reproduce it.

## Free dataset: no server, no MCP, no payment

[`vulnerability-acceptance-rates.json`](vulnerability-acceptance-rates.json) is the same data
`list_vulnerability_patterns` serves, as a static file. No API call, no account, no network
dependency at all. Download it, or copy it into your own tool's rule set. CC0 licensed, use it
however you want, credit optional.

```bash
curl -sO https://raw.githubusercontent.com/holistis/bug-bounty-intelligence-mcp/main/vulnerability-acceptance-rates.json
```

If you're building a local-first / offline security scanner and the paid `scan_contract` tool
below isn't a fit for your project's architecture, this file might still be useful on its own.

## Just want pattern search, nothing paid? Use 3ilm-mcp instead

[3ilm-mcp](https://github.com/holistis/3ilm-mcp) is a smaller, free-only MCP server built from
the same verified dataset. It has no paid tier at all, just pattern search
(`search_vulnerabilities`, `get_pattern_details`, `list_patterns`). Use this repo
(bug-bounty-intelligence-mcp) if you also want the paid `scan_contract` scan; use
3ilm-mcp if you only ever wanted the free lookup tools and prefer the lighter package.

Two more tools in the same Al-Mizaan toolkit, for the rest of the workflow: [al-mizaan-judge](https://github.com/holistis/al-mizaan-judge) is a local CLI that pressure-tests a candidate finding through the same 7-gate framework before you submit it, and [DeFi Signal API](https://github.com/holistis/defi-signal-api) exposes the same vuln-search/bug-intel routes as a pay-per-call HTTP API for anyone who wants this outside MCP.

## Benchmark: vs Slither

**[See the full benchmark →](BENCHMARK.md)**

On 3FLabs/grunt (ERC-4626 + Morpho vaults, 218 contracts): Slither reports 27 "High" findings. After analysis: 24 are in `lib/solady` (out-of-scope dependency with known Slither false positive patterns), and 3 are EIP-712 design patterns. False positive rate: **100%**.

In that comparison Bug Bounty Intelligence was pointed at `src/` only. The paid scan now leaves out tests, mocks, scripts, interfaces and vendored libraries by rule. It does not run the 7-gate filter.

We also reported a related `divide-before-multiply` pattern on the same `lib/solady` code directly to the Slither project: [crytic/slither#3039](https://github.com/crytic/slither/issues/3039). A maintainer merged a fix for part of it ([crytic/slither#3040](https://github.com/crytic/slither/pull/3040)); see [BENCHMARK.md](BENCHMARK.md) for the honest scope of what that fix does and doesn't cover, we overclaimed in the original report.

## What it does

Submit a public GitHub repo containing Solidity smart contracts. Receive a report of AI-generated hypotheses, usually within a few minutes, that states how much of the code was read (see the update and the limits at the top of this page).

## Tools

| Tool | Description | Cost |
|------|-------------|------|
| `scan_contract` | Submit repo for security analysis | $5 USDC |
| `get_scan_report` | Poll status and get report URL | Free |
| `list_vulnerability_patterns` | Show acceptance rates from exact-reconciled Sherlock contests | Free |

## Quick start (Claude Desktop / Claude Code)

Also listed in [PuPu](https://github.com/haoxiang-xu/PuPu)'s MCP store as of release v0.1.11 ([registration issue](https://github.com/haoxiang-xu/PuPu/issues/186)).

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

If `scan_contract` returns `PAYMENT REQUIRED`, send exactly $5 USDC on Base to the address shown, then retry. Payment = acceptance of [service terms](https://x402.tokenizen.nl/terms).

**x402 info:**
- Network: Base mainnet (eip155:8453)
- Amount: 5,000,000 (= 5 USDC, 6 decimals)
- Asset: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (USDC)
- Wallet: 0x015Eb036560216B3051339061FF68A207E0fe88f

The wallet address can change. Always pay the address `scan_contract` actually returns in its `PAYMENT REQUIRED` response, not a copy of this README. This document is updated when the address changes, but the live tool response is the source of truth.

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
Pay to:  0x015Eb036560216B3051339061FF68A207E0fe88f
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

The Al-Mizaan v3 framework defines 7 gates:

1. Code reading (literal, not docs)
2. Reachability chain (entry to exploit)
3. Threat model (who can trigger it)
4. Invariant breach (what rule is violated)
5. Protocol intent (was this intended?)
6. Impact (real financial damage)
7. Formal proof (reproducible PoC)

This is the framework used for manual review (the `al-mizaan-judge` CLI). The paid scan does not run it end to end, see the correction at the top of this page.

## Service info

- **API endpoint**: https://x402.tokenizen.nl/api/bug-intel
- **Free precheck**: https://x402.tokenizen.nl/api/bug-intel/precheck?repo=owner/name
- **Terms**: https://x402.tokenizen.nl/terms
- **Delivery**: usually within the hour, at most 48 hours according to the terms
- **If it fails or does not help**: write to info@holistischadviseur.nl with the job id for a new attempt or a refund, see the terms
- **Source code**: deleted after analysis

## Support this project

This is a free, open-source MCP server maintained in my spare time. If it caught something useful before you shipped, tips are welcome and appreciated (never expected):

`0xdffcC75a674257be6FE1b5549FE52e8f8a6A3A5A` (USDC, Base)
