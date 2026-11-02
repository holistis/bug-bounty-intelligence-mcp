# Audit report

## [Medium] setHlpDepositEnabled has no access control; anyone can toggle the HLP deposit switch

File: MonetrixVault.sol
Function: setHlpDepositEnabled()

setHlpDepositEnabled(bool) is external and only has the whenOperatorNotPaused modifier. It has no onlyOperator, onlyGovernor or onlyGuardian check, so any address can write hlpDepositEnabled. depositToHLP requires hlpDepositEnabled, and the flag is described as a freeze switch ('HLP deposit frozen'). An outsider can therefore override the protocol's decision in either direction.

Attack path: 1) Governance or the operator sets hlpDepositEnabled=false, for example because HLP is considered unsafe. 2) Any EOA calls setHlpDepositEnabled(true). 3) The operator's depositToHLP passes again and funds go into the frozen strategy. Alternatively, the attacker sets false at any time and blocks every depositToHLP call, and does so again after each re-enable.

Impact: An unauthorised party controls a risk-management switch. They can force-reopen a strategy that was frozen for safety, or permanently deny the HLP yield strategy.

## [Medium] reclaimFromRedeemEscrow is callable by anyone and can drain pre-funded redemption USDC from the escrow

File: MonetrixVault.sol
Function: reclaimFromRedeemEscrow()

reclaimFromRedeemEscrow(amount) has requireWired and whenOperatorNotPaused, but no onlyOperator or onlyGovernor. It calls IRedeemEscrow(redeemEscrow).reclaimTo(address(this), amount) with the vault as the caller. The escrow can only authenticate the vault as msg.sender, so it cannot tell who triggered the call. Any external account can therefore make the vault pull USDC back out of RedeemEscrow. The escrow's own guard on how much may be reclaimed was not readable.

Attack path: 1) The operator funds RedeemEscrow through fundRedemptions so that users with matured claims can be paid. 2) An attacker calls reclaimFromRedeemEscrow(amount) with an arbitrary amount. 3) USDC moves back to the vault. claimRedeem then calls payOut against an under-funded escrow and reverts, or the funds are bridged out by keeperBridge.

Impact: A griefing party can keep redemptions un-payable and force the operator to re-fund repeatedly. This is a liveness attack on user withdrawals. It would be worse if the escrow's reclaim limit is loose.

## [Medium] sUSDM yield can be sniped just-in-time; the cooldown does not stop it because the rate is locked at request time

File: sUSDM.sol
Function: injectYield() / cooldownShares()

injectYield raises totalAssets instantly and the share price jumps in one step, with no streaming or vesting. cooldownShares and cooldownAssets burn shares at the current rate and lock usdmAmount into the request. A staker who deposits just before distributeYield and calls cooldownShares right after captures a pro-rata share of the whole injection. The 3-day cooldown only delays payout; it does not expose the staker to risk or to dilution. The only guard in injectYield is totalSupply()>0, so a dust staker would receive 100% of userShare.

Attack path: 1) The attacker sees settle/distributeYield pending (the operator transaction is public). 2) The attacker deposits a large amount of USDM into sUSDM. 3) distributeYield mints userShare and calls injectYield, and the rate rises. 4) The attacker calls cooldownShares and locks in the higher rate. 5) After the cooldown the attacker claims principal plus a large share of the yield. Honest long-term stakers are diluted.

Impact: Yield intended for long-term stakers is extracted by flash-style stakers. For a large position this can be nearly the whole user yield tranche, and the attacker bears essentially no duration risk.

## [Medium] distributeYield reverts permanently when userShare exceeds maxYieldPerInjection, blocking yield and insurance/foundation payouts

File: MonetrixVault.sol
Function: distributeYield()

distributeYield pulls the entire yieldEscrow balance and computes userShare = totalYield * userYieldBps / 10000. It then calls susdm.injectYield(userShare), which requires usdmAmount <= config.maxYieldPerInjection() (default 1,000,000e6). There is no splitting of the injection into chunks and no fallback path. If yield accumulates across several settle() calls before distribution, userShare can exceed the cap, and every distributeYield attempt reverts. The same revert also blocks the insurance and foundation transfers in the same call. The yield stays in yieldEscrow until governance raises the cap through a 24h timelock.

Attack path: 1) The operator runs settle() several times and accumulates a yieldEscrow balance whose user share is above maxYieldPerInjection. 2) The operator calls distributeYield. 3) injectYield reverts with 'yield exceeds max' and the whole transaction reverts. 4) Yield for users, insurance and foundation is frozen until the cap is changed.

Impact: Delayed yield and insurance funding for at least the timelock period, and an unintended coupling between a per-injection cap and the whole distribution.

## [Medium] outstandingL1Principal drifts below real L1 principal when yield is paid from EVM-held deposits

File: MonetrixVault.sol
Function: keeperBridge()/settle()/bridgePrincipalFromL1()

`outstandingL1Principal` only goes up in `keeperBridge` (by the amount bridged) and down in the two principal-bridge functions. `bridgeYieldFromL1` and `settle` never touch it. `settle` pays yield out of whatever USDC is on the EVM side (`available = vaultBal - shortfall`), and that balance can be fresh user deposits that were never bridged. The matching yield stays on L1 as ordinary USDC. Afterwards `keeperBridge` bridges only the reduced balance, so `outstandingL1Principal` is lower than the USDC on L1 that backs user principal. `bridgePrincipalFromL1` and `emergencyBridgePrincipalFromL1` are both capped by `outstandingL1Principal`. `bridgeYieldFromL1` is capped by the Accountant surplus, which is already zero after settlement.

Attack path: 1) L1 holds principal P0 plus 10 of unsettled yield. 2) Users deposit 100, which sits in the Vault. 3) The operator calls `settle(10)`, which pays the yield from the Vault's EVM USDC. 4) `keeperBridge` bridges the remaining 90, so `outstandingL1Principal` is P0+90 while L1 holds P0+100. 5) Users redeem everything. The last 10 of redemptions cannot be funded through `bridgePrincipalFromL1` (capped at P0+90) or `bridgeYieldFromL1` (surplus is 0).

Impact: Part of user principal sits on L1 where the bridge-back functions cannot reach it. The last redeemers are blocked until the governor sends a raw action through the 24h timelock.

## [Medium] removeTradeableAsset makes closeHedge/repairHedge revert for delisted assets, so open hedges cannot be unwound

File: MonetrixConfig.sol
Function: removeTradeableAsset()

removeTradeableAsset deletes isPerpWhitelisted, perpToSpotPairAssetId and isSpotPairAssetIdWhitelisted for the asset immediately. MonetrixVault.closeHedge and repairHedge call _requireHedgePair or _requireRepairAsset, which require those whitelist flags. Delisting an asset that still has an open spot+perp hedge makes the vault unable to close or repair that hedge through the normal operator path. The only remaining route is the governor's emergencyRawAction, behind a 24h timelock.

Attack path: 1) A hedge is open on perp P and spot S. 2) Governance delists P through removeTradeableAsset, for example to stop new hedges. 3) The operator calls closeHedge for P, and _requireHedgePair reverts with 'perp not whitelisted'. 4) The perp stays open and keeps accruing funding and liquidation risk until a timelocked emergency action.

Impact: An unhedged or unmanaged delta-neutral position remains, which risks liquidation and loss of backing. The delay is at least 24h.

## [Medium] Dust staker can capture the whole user yield share when real stakers have exited

File: MonetrixVault.sol
Function: distributeYield()

`distributeYield` only checks `susdm.totalSupply() == 0` before sending `userShare` to `injectYield`, and `injectYield` only requires `totalSupply() > 0`. Any non-zero supply, however small, is treated as a valid staker base. The whole `userShare`, 70% of the yield by default, is then added to `totalAssets` and accrues to that supply. The operator's call is observable in the mempool or can be predicted from settlement timing. An attacker stakes the minimum into sUSDM just before the call and ends up holding almost all of the shares. Because the cooldown locks the rate at request time, the attacker then runs `cooldownShares` and claims the yield after the cooldown.

Attack path: 1) Most stakers have left, leaving a tiny supply. 2) The attacker sees the pending `distributeYield`, or predicts it from `settle`. 3) The attacker calls `sUSDM.deposit` with a large amount just before it. 4) `injectYield` adds `userShare` to `totalAssets`. 5) The attacker calls `cooldownShares` and later `claimUnstake`, taking nearly all of `userShare` after a small time at risk.

Impact: The user share of yield goes to a just-in-time depositor instead of the real stakers. The shortcut for zero supply does not cover low supply.

## [Medium] Replacing redeemEscrow or yieldEscrow strands in-flight obligations and funds in the old contract

File: MonetrixVault.sol
Function: setRedeemEscrow()/setYieldEscrow()

Pending redemptions are recorded as obligations inside the current `redeemEscrow` through `addObligation` in `requestRedeem`. `claimRedeem` pays out through whichever address `redeemEscrow` currently holds. `setRedeemEscrow` swaps the address with no migration and no check that the old escrow has no obligations or balance. The same applies to `yieldEscrow`: `settle` sends USDC to it, and `distributeYield` reads `balance()` from the new address only.

Attack path: 1) Users call `requestRedeem`, which registers obligations in the old escrow. 2) The governor calls `setRedeemEscrow(newEscrow)`. 3) `claimRedeem` calls `newEscrow.payOut`, which has no obligation or balance for those requests. Either claims revert, or the Vault's `shortfall` readings no longer match reality. The funds the old escrow holds, including prefunded USDC, can only be reached through functions that act on the new escrow. Settled but undistributed yield in the old `yieldEscrow` is likewise unreachable.

Impact: Redemptions can be frozen and funds locked until the governor reverts the change. Such a swap is a likely upgrade or migration step.

## [Medium] _sendL1Bridge counts spot `total` including held balance as available, so SEND_ASSET can still be silently dropped

File: MonetrixVault.sol
Function: _sendL1Bridge()

The guard is meant to prevent silent L1 drops of the bridge action. It compares `PrecompileReader.spotBalance(...).total` with the amount. On HyperCore the spot `total` includes the `hold` portion, which is locked by open orders such as hedge buy-spot limit orders. Only the free part can be sent. With `pmEnabled`, the supplied balance is added to `l1Available`, but a supplied balance cannot be sent directly without first being withdrawn from BLP.

Attack path: 1) A hedge limit order is still open and holds part of the USDC. 2) The operator calls `bridgePrincipalFromL1`. 3) `outstandingL1Principal` is decremented and the guard passes on `total`. 4) The L1 send is dropped for lack of free balance.

Impact: `outstandingL1Principal` is reduced with no USDC arriving. The redemption shortfall stays open and the operator has to recover manually.
