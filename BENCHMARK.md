# Benchmark: Bug Bounty Intelligence vs Slither

**Target protocol:** 3FLabs/grunt — leveraged strategies for on-chain funds  
**Protocol type:** ERC-4626/ERC-7540 vaults + Morpho lending + flash loan requests  
**Scope:** `src/` (218 Solidity files)  
**Slither version:** 0.10.x  
**Date:** 2026-07-20

---

## TL;DR

| Metric | Slither | Bug Bounty Intelligence |
|--------|---------|------------------------|
| "High" findings reported | 27 | 0 |
| True positives (real bugs) | 0 | 0 |
| False positives | 27 (100%) | 0 |
| Out-of-scope library noise | 24 (89%) | 0 |
| Signals requiring human review | n/a | 17 |
| Reading time to triage all "Highs" | ~4 hours | ~15 min |

**Slither false positive rate on this codebase: 100%.**

---

## Test setup

We ran Slither on the full repo (including `lib/`), and Bug Bounty Intelligence on `src/` only. The scope for any real audit is `src/` — dependencies in `lib/` are battle-tested third-party code that has its own audit history.

---

## Slither's 27 "High" findings — breakdown

### Group A: 24 findings in `lib/solady/` (out of scope)

Slither flagged 24 High-severity issues, all in the `lib/solady/` dependency:

- 5x `incorrect-exp` — Solady uses XOR (`^`) for bitwise operations, not exponentiation. Slither confuses the two.
- 19x `incorrect-shift` — Solady uses `<<` / `>>` inside assembly blocks. Slither's detector fires on these but they are intentional and correct.

**Why these are not bugs:**

Solady is one of the most audited Solidity libraries in existence, used by hundreds of protocols. Its math implementations deliberately use low-level bit operations for gas efficiency. Slither's `incorrect-exp` and `incorrect-shift` detectors are known to produce false positives on Solady. Every human auditor knows to ignore these. Slither does not.

**Example:**

```
incorrect-shift | FixedPointMathLib.lnWad(int256) (lib/solady/src/utils/FixedPointMathLib.sol#269-341)
contains an incorrect shift operation: ...
```

This is in `lib/solady/`, a third-party library. It is out of scope for any 3FLabs audit.

### Group B: 3 findings in `src/` — all false positives

Slither flagged 3 uses of `safeTransferFrom(offer.maker, ...)` as "arbitrary from in transferFrom":

```
arbitrary-send-erc20 | Request.consume() uses arbitrary from in transferFrom:
  _asset().safeTransferFrom(offer.maker, address(this), ptAmount)
```

**Why this is not a bug:**

`offer.maker` is not arbitrary. The offer is validated via EIP-712 signature before the transfer (`_validateOffer(offer, signature)` is called on line 421). The maker explicitly signed the offer, authorizing exactly this transfer of exactly this amount. Additionally, `consume()` is gated by `onlyOwnerOrRoles(_ROLE_CONSUMER)` — only trusted consumers can call it.

This is a correct and standard EIP-712 off-chain order pattern. Slither has no understanding of EIP-712 and cannot reason about signature-based authorization.

---

## What Bug Bounty Intelligence flags instead

After filtering to `src/` and applying Al-Mizaan validation gates, we identified **17 signals requiring human review** — none rising to a confirmed finding:

| Category | Count | Description |
|----------|-------|-------------|
| `unsafe_keyword` | 15 | Explicit `forge-lint: disable-next-line(unsafe-typecast)` annotations — developer acknowledged unsafe casts. Require review for truncation risk. |
| `delegatecall` | 2 | `MorphoFlashLoanRequest.execute()` delegatecalls to whitelisted scripts. By design — whitelist check present. |

**What we do not flag:**
- Library code in `lib/` (out of scope)
- EIP-712 signed transfers (intentional pattern, not a vulnerability)
- Standard Solady bit operations (well-audited library behavior)

---

## Al-Mizaan filtering — why the 17 signals do not become findings

The 15 `unsafe_keyword` signals (explicit forge-lint disables) were put through Al-Mizaan's reachability chain:

1. **Code** — read the actual casts in `LibTokenController.sol`, `TokenController.sol`, and `PositionManagerLP.sol`
2. **Reachability** — are the truncated values reachable by an untrusted caller?
3. **Threat model** — who triggers these paths? In all cases, the entry points are role-gated (owner, ROLE_CONSUMER, ROLE_MANAGER)
4. **Invariant** — does the truncation break any accounting invariant?

Verdict: The typecasts are `uint256 → uint128` in share accounting. The values come from internal calculations that are capped by deposit limits. Overflow requires either extremely large TVL or a role-gated actor. **Trusted actor as sole trigger → ELIMINATE.**

The 2 `delegatecall` signals: `MorphoFlashLoanRequest` maintains an explicit `isScriptWhitelisted` mapping. Only the owner can whitelist. **Trusted actor (owner) as sole attacker → ELIMINATE.**

**Result: 0 confirmed findings.** This matches the expected difficulty level of a mature protocol with prior audits.

---

## Why Slither's false positive rate matters

A 100% false positive rate on High findings is not an edge case. It happens because:

1. **No scope awareness** — Slither scans everything, including dependencies. A real audit scopes to `src/` only.
2. **No protocol context** — Slither cannot distinguish between an arbitrary `transferFrom` and an EIP-712-authorized one.
3. **No library knowledge** — Solady's assembly patterns trigger false positives on multiple detectors.

For a developer running Slither for the first time, triaging 27 "High" findings (all false positives) takes hours. For a developer using Bug Bounty Intelligence, the 17 signals that remain after scope filtering take 15 minutes to review.

---

## When Slither IS useful

Slither is best used as a first-pass tool before human review, with explicit exclusions:

```bash
slither src/ --exclude incorrect-exp,incorrect-shift --filter-paths "lib/"
```

After filtering, Slither's Medium and Low findings become more useful starting points.

Bug Bounty Intelligence is designed to do this filtering for you, and adds protocol-context reasoning that static analysis cannot.

---

## Reproduce this benchmark

The 3FLabs/grunt codebase is public at [github.com/3FLabs/grunt](https://github.com/3FLabs/grunt).

To reproduce Slither's output:
```bash
git clone https://github.com/3FLabs/grunt
cd grunt
pip install slither-analyzer
slither . --json slither-output.json
```

To use Bug Bounty Intelligence:
```bash
npx -y bug-bounty-intelligence-mcp@latest
```

Then in your MCP client:
```
scan_contract({ repo_url: "https://github.com/3FLabs/grunt", protocol_type: "LENDING" })
```

---

## About Bug Bounty Intelligence

Trained on 27,681 real accepted audit findings from Sherlock and Code4rena. Uses the Al-Mizaan v3 framework — a 7-gate validation chain (Code, Reachability, Threat-Model, Invariant, Protocol-Intent, Impact, Proof) — to filter signals into confirmed findings.

**Cost:** $5 USDC on Base (eip155:8453) via x402.  
**Install:** `npx -y bug-bounty-intelligence-mcp@latest`  
**npm:** [npmjs.com/package/bug-bounty-intelligence-mcp](https://www.npmjs.com/package/bug-bounty-intelligence-mcp)
