# Audit report

## [Medium] Just-in-time staking captures injected yield with no holding period

File: sUSDM.sol
Function: deposit() / cooldownShares() / injectYield()

Yield reaches sUSDM in one lump through injectYield, called from MonetrixVault.distributeYield. injectYield raises totalAssets() (the USDM balance) immediately, so the share price jumps in a single transaction. deposit() and mint() have no minimum holding time, and cooldownShares() burns shares at the new, post-injection rate. Because the injection amount and timing are publicly observable (operator transaction, and a minted USDM transfer), a staker can deposit just before it and call cooldownShares just after. The staker takes a pro-rata share of the full lump without being exposed during the accrual period. The 3-day cooldown only locks principal, which earns nothing while locked, and no loss risk applies.

Attack path: 1) Watch for the operator's distributeYield transaction. 2) Deposit a large amount of USDM into sUSDM in the block before it. 3) After injectYield, call cooldownShares on all shares. 4) After the cooldown, claimUnstake returns the principal plus a pro-rata share of the yield. 5) Repeat each cycle, using rolling capital.

Impact: Long-term stakers are diluted. The share of the 70% user yield that a flash staker takes is proportional to the stake they add, so honest stakers can lose most of the yield they should earn.

## [Medium] distributeYield reverts when user share exceeds maxYieldPerInjection, trapping yield in YieldEscrow

File: MonetrixVault.sol
Function: distributeYield()

distributeYield sets totalYield to the whole YieldEscrow balance, which accumulates across every settle() call since the last distribution. It computes userShare as 70% of that and calls susdm.injectYield(userShare) unconditionally. injectYield requires usdmAmount <= config.maxYieldPerInjection() (default 1,000,000e6) and reverts otherwise. If a backlog builds up (operator pauses, settle called many times, or a large donation to the escrow), userShare exceeds the cap. Every distributeYield call then reverts, and the whole totalYield, including the insurance and foundation portions, stays stuck. The vault never splits the injection into chunks and never pulls only part of the escrow.

Attack path: 1) Yield accumulates in YieldEscrow over several settle() calls, or someone transfers USDC directly to the escrow, so that 70% of its balance is above maxYieldPerInjection. 2) The operator calls distributeYield and it reverts with 'sUSDM: yield exceeds max'. 3) It keeps reverting until the governor raises the cap or lowers the user bps, which takes the 24h timelock.

Impact: Yield distribution halts, and insurance fund and foundation payouts stop with it. If the escrow can be topped up by anyone, an attacker can keep it blocked at the cost of the donated USDC. This is a temporary liveness failure.

## [Medium] L1 bridge-back checks use stale async L1 state while outstandingL1Principal is decremented eagerly

File: MonetrixVault.sol
Function: _sendL1Bridge() / bridgePrincipalFromL1() / emergencyBridgePrincipalFromL1()

bridgePrincipalFromL1 and emergencyBridgePrincipalFromL1 subtract `amount` from outstandingL1Principal before calling _sendL1Bridge. _sendL1Bridge only checks that the L1 spot `total` (plus supplied under PM) read through the precompile is at least `amount`. CoreWriter actions execute asynchronously, so the read ignores earlier queued but unexecuted actions: bridge-backs and executeHedge buy orders issued in the same or an earlier block. Spot `total` should also include funds held for open orders (I could not read PrecompileReader to confirm). The per-call caps (`amount <= redemptionShortfall()` and `amount <= outstandingL1Principal`) are not reduced by bridge-backs already in flight, because the shortfall only drops after USDC lands and fundRedemptions runs. When the L1 SEND_ASSET is silently dropped for lack of free balance, the EVM counter has already fallen and no USDC arrives.

Attack path: 1. Operator calls executeHedge, which queues a spot buy that locks USDC. 2. In the same or the next block, operator calls bridgePrincipalFromL1(X). The precompile still shows the pre-order balance, so the check passes, outstandingL1Principal -= X, and the bridge action is queued. 3. On L1 the order or an earlier bridge consumes the funds first, so the bridge action is dropped. 4. outstandingL1Principal is now X lower than the real L1 principal. The same happens if two bridge-backs are queued in one block against one balance.

Impact: outstandingL1Principal permanently understates principal held on L1. Both bridgePrincipalFromL1 and the governor's emergency path cap on that counter, so the stranded principal cannot be pulled back through principal paths. Redemption funding can be blocked or delayed, and the counter no longer matches reality.

## [Medium] removeTradeableAsset can orphan open hedge positions so closeHedge and repairHedge revert

File: MonetrixConfig.sol
Function: removeTradeableAsset()

removeTradeableAsset deletes isPerpWhitelisted, isSpotWhitelisted, isSpotPairAssetIdWhitelisted and the perp/spot maps, with no check for open L1 positions. closeHedge calls _requireHedgePair, which requires config.isPerpWhitelisted(perpAsset) and perpToSpotPairAssetId(perpAsset) == spotAsset. repairHedge calls _requireRepairAsset, which requires the same whitelists. After removal, the operator can no longer unwind the spot and perp legs through the vault. The only route left is emergencyRawAction, which is a governor action behind the 24h timelock. Any accountant logic that reads the whitelist or tradeableAssets to value positions will also drop the removed asset, which could mis-state surplus. I could not confirm this because MonetrixAccountant was not readable.

Attack path: 1) The vault holds a delta-neutral position in asset X. 2) The governor removes X, for example because of a listing change or a mistake. 3) The operator calls closeHedge for X and it reverts with 'perp not whitelisted'. 4) The positions stay open and unhedged risk and funding costs build up until the governor acts through the timelock.

Impact: Capital stuck in an unmanaged L1 position for at least 24h, and possible mis-accounting of backing.

## [Medium] keeperBridge to multisig puts principal on an account the vault cannot pull back from

File: MonetrixVault.sol
Function: keeperBridge() / bridgePrincipalFromL1()

keeperBridge increments outstandingL1Principal and deposits USDC to L1 for the multisigVault when target == Multisig and multisigVaultEnabled. bridgePrincipalFromL1 and emergencyBridgePrincipalFromL1 reduce outstandingL1Principal, but _sendL1Bridge checks and sends only from the vault's own L1 balance (PrecompileReader.spotBalance(address(this))). Principal sitting on the multisig's L1 account cannot be returned by any vault function. The vault cannot return funds that sit in the multisig account, and redemption funding depends on this path.

Attack path: 1) The operator bridges to the multisig target. 2) Users call requestRedeem, which creates a shortfall. 3) bridgePrincipalFromL1 cannot be satisfied from the vault's own L1 balance, so it reverts with 'L1 USDC insufficient'. 4) Redemptions stay unfunded until the multisig moves the funds back off-chain.

Impact: Users' redemptions can be stalled. The principal tracking also stays high, since outstandingL1Principal remains non-zero.

## [Medium] Replacing redeemEscrow or yieldEscrow leaves pending obligations and funds stranded in the old escrow

File: MonetrixVault.sol
Function: setRedeemEscrow() / setYieldEscrow()

requestRedeem records each obligation in the current redeemEscrow via addObligation. claimRedeem pays from whatever address is stored in `redeemEscrow` at claim time. setRedeemEscrow and setYieldEscrow overwrite the address with no migration, no check that the old escrow has no obligations or balance, and no way to move existing obligations. Requests made before the swap have their USDM held in the vault but their obligation and funded USDC sit in the old escrow. The new escrow has no matching obligation or balance for them.

Attack path: 1. Users call requestRedeem, so the old escrow holds obligations and possibly funded USDC. 2. Governor calls setRedeemEscrow(newEscrow), for example as part of an upgrade or migration. 3. Users call claimRedeem, and payOut runs on the new escrow, which has no matching funds or obligation. The call reverts, or it succeeds and drains funds meant for other requests.

Impact: Pending redemptions are frozen until the governor migrates by hand. The new escrow's shortfall also ignores the old obligations, so netBridgeable and settle may release USDC that should back them.

## [Medium] supplyToBlp whitelist check truncates the uint64 token to uint32 while the full value is sent to L1

File: MonetrixVault.sol
Function: supplyToBlp()

supplyToBlp takes `uint64 token`. For non-USDC tokens it validates `config.isSpotWhitelisted(uint32(token))` and derives `spotToPerp(uint32(token))`. The explicit cast drops the upper 32 bits, so a token such as 2^32 + whitelistedIndex passes validation. ActionEncoder.sendSupply(token, l1Amount) and the Accountant notification still receive or act on the original value. The whitelist therefore does not constrain the token that is actually supplied to the BLP.

Attack path: 1. Operator calls supplyToBlp(token = (1<<32) | wlIndex, amount). 2. The whitelist check passes on the truncated index. 3. Accountant.notifyVaultSupply registers a token and perp pair that does not match the real token index.

Impact: A non-whitelisted or invalid token can be supplied, or the Accountant's tracked supplied positions get mis-keyed. That can make the Accountant's strict supplied reads wrong or revert, which blocks settlement. This needs the operator role, which is trusted, and I could not verify the Accountant side.
