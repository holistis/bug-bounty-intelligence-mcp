# Audit report

## [Medium] Deposits/harvest use provideToSP(...,false), stashing collateral gains that tend never sees

File: Strategy.sol
Function: _deployFunds() / isCollateralGainToClaim() / _tendTrigger()

_deployFunds calls SP.provideToSP(_amount, false). In Liquity V2, doClaim=false moves the depositor's pending collateral gain into stashedColl and resets the gain snapshots. isCollateralGainToClaim() only reads SP.getDepositorCollGain(), which excludes stashedColl, and _tendTrigger and _tend rely on it. After any liquidation, the next user deposit or harvest that deploys idle BOLD (_deployFunds) hides the collateral from the tend trigger. claim() is only called from _tend when isCollateralGainToClaim() is true, and COLL.balanceOf(this) is still 0, so the trigger stays false. The collateral stays in the pool, unauctioned and exposed to price moves, until some later withdrawFromSP(...,true) pulls it out.

Attack path: 1) A liquidation gives the strategy a collateral gain. 2) Any user deposits, or a keeper harvests with idle BOLD above dustThreshold, and _deployFunds stashes the gain. 3) tendTrigger() returns false, so the keeper does not tend. 4) The collateral is not auctioned until a later withdrawal happens to claim it.

Impact: The collateral is not auctioned promptly, which breaks the stated 'tend as soon as collateral is available' invariant. The strategy keeps unhedged collateral price exposure, and its reported assets show an avoidable loss.

## [Medium] Pending BOLD yield from the Stability Pool is never counted or claimed by harvest

File: Strategy.sol
Function: _harvestAndReport() / estimatedTotalAssets()

estimatedTotalAssets() is idle BOLD plus SP.getCompoundedBoldDeposit(this). It omits the pending interest yield from SP.getDepositorYieldGain(this). _harvestAndReport() does not claim: it only deploys idle BOLD that is already in the strategy. When all funds are deployed and idle is 0 or below dustThreshold, no SP call is made, so the yield is neither claimed nor reported. It becomes visible only after some other interaction (a deposit, a withdrawal or the public claim()) moves it into the deposit or into idle.

Attack path: 1) The strategy is fully deployed and accrues yield in the SP. 2) A keeper calls report(). _harvestAndReport returns a total with no yield, so no profit is recorded. 3) A user enters or exits, or someone calls claim(), and the yield lands in the strategy. 4) The next report books a lump-sum profit, so a user who enters before it shares in yield that accrued earlier.

Impact: Yield is reported late and in lumps. This enables profit sandwiching in strategies open to public deposits and mis-timed fee and profit accounting for yBOLD.

## [Medium] Collateral gains excluded from totalAssets let late depositors capture recovery after a temporary loss

File: Strategy.sol
Function: _harvestAndReport()/estimatedTotalAssets()

estimatedTotalAssets() counts only idle BOLD plus SP.getCompoundedBoldDeposit(). Collateral claimed from the SP, or sitting in AUCTION, is not counted until the auction proceeds come back as BOLD. After a liquidation, a report records a loss (permitted by raising the loss limit). This lowers the strategy's pps and, through the vault, yBOLD's pps. The same value returns as a 'gain' once the auction settles and a later report is made. Anyone can deposit into yBOLD, or into the strategy if it is open, between the loss report and the recovery report. The share price is then depressed even though the collateral is worth the difference. In Accountant.report, `needed = supply - assets` grows with the discounted deposit, so the recovered gain is absorbed by yBOLD holders and no fee is charged. This works against the invariant that yBOLD stays 1:1 except on real loss.

Attack path: 1) A liquidation moves value from BOLD into collateral. 2) The keeper reports, the strategy books a loss, and the vault's pps drops below 1. 3) The attacker deposits BOLD into yBOLD at the discounted pps. 4) The keeper's tend auctions the collateral and a later report books the gain. The Accountant takes no fee because assets < supply, so pps rises. 5) The attacker redeems at the higher pps. The profit comes from earlier holders and from the fees st-yBOLD would have received.

Impact: Value moves from existing yBOLD holders and st-yBOLD (fees) to opportunistic depositors. The 1:1 invariant breaks for those who were in at the time of the loss.

## [Medium] Permissionless StakerFactory.newStrategy lets anyone overwrite deployments[asset] registry

File: StakerFactory.sol
Function: newStrategy()

newStrategy has no access control, unlike StrategyFactory.newStrategy, which is onlyManagement. Any caller can deploy a LV2SPStakerStrategy for any vault with an accountant, and the factory then writes deployments[_asset] = newStrategy. isDeployedStrategy() answers by comparing against that single mapping slot, so the official strategy stops being recognised as factory-deployed after an overwrite. An attacker also controls the name and the call sequence, and each deployment makes the factory the strategy's management until the pending management is accepted.

Attack path: 1) The legitimate st-yBOLD strategy is deployed through the factory. 2) An attacker calls newStrategy(yBOLD, 'x'). 3) deployments[yBOLD] now points to the attacker's instance. 4) isDeployedStrategy(legit) returns false and isDeployedStrategy(attacker's) returns true.

Impact: Any integration or verification that trusts the factory registry can be spoofed or have its legitimate strategy rejected. It only has effect if something depends on this registry.

## [Medium] Accountant takes full fee on a gain even if a loss on another strategy is not yet reported

File: Accountant.sol
Function: report()

The 'no fees while pps < 1' protection compares vault.totalSupply() with vault.totalAssets() at the moment of the call. It only sees losses already booked in the vault. If strategy A has a gain and strategy B has an unrealised loss (for example a Stability Pool liquidation not yet reported), reporting A first sees assets >= supply and sets totalFees = gain. All of A's gain is minted to the Accountant and forwarded to st-yBOLD. When B's loss is reported afterwards, yBOLD falls below 1:1 and plain yBOLD holders carry it, although the fees were already paid out.

Attack path: 1) A liquidation reduces strategy B's BOLD, but B has not been reported. 2) The reporter reports strategy A, which has a gain, and the full gain is taken as fees. 3) B is reported with its loss. 4) The yBOLD price per share is below 1 and the fees have already left the Accountant.

Impact: The stated invariant that the Accountant covers losses before paying fees can be broken. yBOLD holders bear a loss while stakers keep the gain.

## [Medium] Accountant distributes held fee shares to the Staker even while yBOLD is below 1:1 (loss never covered)

File: Accountant.sol
Function: distribute(address)/distribute(address,uint256)

The README says the Accountant first covers losses before paying st-yBOLD. The only loss logic is in report(), which sets totalFees to 0 or reduces it for future gains. Fee shares the Accountant already holds are never burned or held back. distribute() has no check on vault totalSupply versus totalAssets. LV2SPStakerStrategy._harvestAndReport() calls ACCOUNTANT.distribute(asset), which transfers the whole yBOLD balance to the recipient, even when the vault has just booked a loss. The held shares are part of `supply`, so they also inflate `needed` in later reports. Staked holders keep earlier yield while yBOLD holders carry the loss.

Attack path: 1) The Accountant holds F yBOLD from earlier gains that have not yet been distributed. 2) A strategy reports a loss, so vault assets < supply. 3) The Staker keeper calls report(), which calls distribute(yBOLD) and sends all F to the Staker. 4) Later gains must first refill `needed`, which still includes the F shares now owned by stakers.

Impact: Losses are not offset by accumulated fees. Non-staked yBOLD holders bear the loss, and the recovery gain is not shared with them.

## [Medium] Strategies and Staker deployed by the factories keep the default 10% performance fee, leaking yield away from the Accountant

File: StrategyFactory.sol
Function: newStrategy()

The factories set the performance fee recipient, keeper, pending management and emergency admin. They never call setPerformanceFee(0). From memory of TokenizedStrategy's initialisation, the default performanceFee is 1000 bps, though I could not read it here. Each profitable report would then mint 10% of the profit as strategy shares to performanceFeeRecipient. The vault, whose profit is meant to be redirected 100% to the Accountant (the README says the effective performance fee is 100%), would receive only about 90% of the real profit. The factory is the strategy's management only during newStrategy, so the fee stays at the default unless pending management accepts and then changes it.

Attack path: 1) The factory deploys a strategy with the default fee. 2) The strategy earns BOLD yield and report() mints fee shares to performanceFeeRecipient. 3) The yBOLD vault's reported gain is smaller than the strategy's profit, so the Accountant and st-yBOLD get less.

Impact: A fixed share of the yield, probably 10%, goes to the fee recipient rather than to st-yBOLD, unless management notices and fixes it.

## [Medium] Staker pins the vault's accountant at construction; a later accountant change or a feeRecipient mismatch breaks every report

File: Staker.sol
Function: _harvestAndReport()

ACCOUNTANT is an immutable read from IVault(_vault).accountant() in the constructor. _harvestAndReport calls ACCOUNTANT.distribute(asset), which succeeds only if the Staker strategy is that accountant's feeRecipient or feeManager (onlyFeeManagerOrRecipient, with msg.sender preserved). If the vault's accountant is changed, or the accountant's feeRecipient is changed or never set to the strategy, distribute reverts. The same happens if the accountant is replaced by one that does not hold yBOLD. Every report() on the Staker then reverts. The strategy cannot refresh the address and no fallback is wrapped in try/catch.

Attack path: 1) The vault manager sets a new accountant, or the feeRecipient is changed. 2) The keeper calls report() on the Staker. 3) distribute reverts and the report fails. New yBOLD fees are never realised, and the Staker keeps reporting a stale totalAssets.

Impact: The Staker cannot report, so st-yBOLD holders stop receiving yield until a new strategy is deployed. Existing holders would need to migrate.

## [Medium] Strategy withdraw/claim reverts when SP deposit is zero (_requireUserHasDeposit)

File: Strategy.sol
Function: _freeFunds() / claim()

_freeFunds always calls SP.withdrawFromSP(_amount, true). I believe Liquity V2 reverts withdrawFromSP when the caller's recorded deposit is 0, even for an amount of 0. If the strategy's pool position has dropped to zero (fully consumed by liquidations, or fully withdrawn), any path that reaches _freeFunds reverts. That includes a user withdraw where idle is below the requested assets, claim(), and _emergencyWithdraw. Collateral that sits in stashedColl (see the stash finding) would then need claimAllCollGains(), which the strategy never calls.

Attack path: 1) The strategy's SP deposit reaches 0 through liquidations or a full withdrawal. 2) A holder calls withdraw for more than idle. 3) TokenizedStrategy calls _freeFunds, SP reverts, and the withdrawal cannot realise its loss. Stashed collateral also stays stuck.

Impact: Withdrawals and the emergency path can be blocked in a rare edge state, and stashed collateral cannot be recovered through the strategy.

## [Medium] Auction starting price truncated to whole BOLD units, which erodes the buffer on small lots

File: Strategy.sol
Function: _tend()

The starting price is computed as `_available * _price / WAD * _bufferPercentage / WAD / WAD`. The extra division by WAD converts the result to whole-BOLD units, so the fractional BOLD part is dropped. For lots just above dustThreshold (1e15 coll, worth about $3), the 10% minimum buffer is partly or wholly truncated. For example, a value of 3.3 becomes 3. The auction then starts at or below market from the first second, and the buffer meant to absorb oracle lag and give a window is lost. Larger lots lose at most under 1 BOLD.

Attack path: 1) Collateral worth just over the dust threshold is claimed. 2) tend sets the truncated starting price and kicks the auction. 3) An arbitrageur takes the lot immediately at or below the oracle value.

Impact: A small loss on each low-value auction, bounded at under 1 BOLD each time. The effect is minor in size, so it may not meet Medium.
