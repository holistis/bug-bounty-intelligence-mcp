# Audit report

## [Medium] Anyone can brand any address a bridged holder by bridging dust, freezing its Titn transfers

File: Titn.sol
Function: _credit()

_credit sets isBridgedTokenHolder[_to] = true for every recipient of an incoming LayerZero transfer. The flag is never cleared. The sender is not checked and the amount is not bounded. _validateTransfer blocks any transfer whose `from` has the flag while isBridgedTokensTransferLocked is true. This applies unless `from` is the owner or transferAllowedContract, or `to` is the allowed contract or lzEndpoint. An attacker can therefore bridge 1 wei to any victim address from another chain. The victim's whole Titn balance on that chain then becomes non-transferable, including tokens the victim obtained by normal means.

Attack path: 1. Attacker holds a little Titn on a source chain. 2. Attacker calls send() with the victim as the recipient on a chain where Titn is deployed, with a tiny amount. 3. _credit mints and sets isBridgedTokenHolder[victim] = true. 4. While the lock is on, the victim's transfer() and transferFrom() revert with BridgedTokensTransferLocked. This includes sends to DEX pools and contracts.

Impact: Targeted freezing of arbitrary users or contracts such as pools, vaults and multisigs. The victim can only move tokens to transferAllowedContract or the lz endpoint, or wait for the owner to unlock.

## [Medium] Merge can allocate more TITN than it holds; no cap on total TGT merged, first-year snapshot then reverts

File: MergeTgt.sol
Function: onTokenTransfer()/withdrawRemainingTitn()

onTokenTransfer credits claimableTitnPerUser and totalTitnClaimable with no cap. It checks neither totalTitnClaimable against TITN_ARB nor the TGT received against TGT_TO_EXCHANGE (579M). It also does not check that the contract's TITN balance covers the claims. If more than 579M TGT is merged, or TITN was not fully deposited, total claims exceed the TITN balance. Claims are then first-come-first-served, so late claimers' transfers revert. After 360 days, withdrawRemainingTitn computes `remainingTitnAfter1Year - initialTotalClaimable`. If the balance is below the snapshot of totalTitnClaimable, this underflows and reverts for every user.

Attack path: 1. TGT holders merge more than 579M TGT in total, or the owner has deposited less than the full amount. 2. Early claimers drain the TITN via claimTitn. 3. Remaining users cannot claim. 4. After 1 year, withdrawRemainingTitn reverts on the underflow for all users, whether or not they claimed.

Impact: Some users' TGT is locked in the contract with no TITN claimable. Late merge participants can lose funds, and the claim logic can be bricked.

## [Medium] Owner can withdraw any token, including users' claimable TITN, at any time

File: MergeTgt.sol
Function: withdraw()

withdraw() lets the owner transfer any amount of any token to itself, with no check against totalTitnClaimable or the time since launch. This covers both the TITN backing user claims and the TGT users deposited. The owner can also set lockedStatus to Locked. If the TITN balance falls below the claims, claimTitn reverts. withdrawRemainingTitn also reverts on the underflow in `remainingTitnAfter1Year - initialTotalClaimable`.

Attack path: 1. Users merge TGT and accrue claimableTitnPerUser. 2. Owner calls withdraw(titn, balance). 3. claimTitn and withdrawRemainingTitn fail for users.

Impact: Users lose the TITN they are owed after giving up TGT, and the claim accounting is bricked.

## [Medium] Leftover TITN after year one is paid only to unclaimed merge holders, so early claimers lose out

File: MergeTgt.sol
Function: withdrawRemainingTitn()

After 360 days, withdrawRemainingTitn() snapshots remainingTitnAfter1Year = titn.balanceOf(this) and initialTotalClaimable = totalTitnClaimable. It then pays each caller claimable + claimable * (remaining - initialTotalClaimable) / initialTotalClaimable. The pool 'remaining - initialTotalClaimable' is all TITN not backed by a pending claim. That includes the unmerged part of the 173.7M TITN_ARB deposit and any dust or donated TITN. This pool is split only among users who left their claimable balance untouched. Users who called claimTitn() earlier get no share. A holder with a tiny remaining claimable balance can end up with a large part of the unmerged supply. Each wallet's share is proportional to its own claimable balance, so splitting wallets does not help.

Attack path: 1. Merge only a small amount of TGT, or hold a small claimable balance, and never call claimTitn() before day 360. 2. After 360 days, call withdrawRemainingTitn(). 3. Receive claimable plus claimable/initialTotalClaimable of the whole unmerged TITN. If few people hold claimable balances, this is nearly all of it. Rational users are pushed to delay claiming, and users who claimed early are treated worse.

Impact: A large part of the TITN reserve goes to whoever still has an unclaimed balance, instead of staying with the treasury or being split fairly. The outcome depends on how many users claimed early.

## [Medium] Merge at exactly 360 days accepts TGT but credits zero TITN

File: MergeTgt.sol
Function: onTokenTransfer()

onTokenTransfer only reverts when `block.timestamp - launchTime > 360 days`. At exactly 360 days it proceeds, but quoteTitn returns 0 because `timeSinceLaunch < 360 days` is false. The TGT is accepted and kept by the contract, and nothing is credited. Likewise, quoteTitn can round to 0 for tiny late amounts. There is no minimum-out check, so the user cannot protect against receiving nothing.

Attack path: A user transfers TGT via transferAndCall in the block where the timestamp equals launchTime + 360 days. The TGT is taken and claimable += 0.

Impact: Loss of the user's TGT. The window is narrow, but there is no slippage protection.

## [Medium] Deployer-minted supply and Arbitrum lock can strand tokens unless deployer is owner

File: Titn.sol
Function: constructor()/_validateTransfer()

The constructor mints initialMintAmount to msg.sender, while the owner is `_delegate`. On Arbitrum (chainid 42161) with the lock on, every transfer is blocked unless `from` is the owner or transferAllowedContract, or `to` is transferAllowedContract or the lz endpoint. A deployer who is not the owner therefore cannot move the minted tokens. The same holds for any ordinary holder. Claims from Merge only work if transferAllowedContract is set to the merge contract. Until the owner calls setTransferAllowedContract, claimTitn and the owner's deposit may revert.

Attack path: Deploy with a deployer different from _delegate on Arbitrum. The deployer's transfer to the owner or any other address reverts with BridgedTokensTransferLocked.

Impact: Initial supply can be locked, or merge claims can be blocked until the admin configuration is fixed.

## [Medium] TITN deposited after the first withdrawRemainingTitn() call is outside the snapshot and is not distributed

File: MergeTgt.sol
Function: deposit()/withdrawRemainingTitn()

deposit() can be called any number of times by the owner. It requires amount == TITN_ARB each time and has no cutoff or one-shot guard. withdrawRemainingTitn() fixes remainingTitnAfter1Year and initialTotalClaimable once, at the first successful call after day 360. A deposit or donation made after that is not part of the snapshot, so it is never distributed to claimants. It is recoverable only through the owner's unrestricted withdraw(). A deposit made before the snapshot is instead absorbed into the bonus pool for claimants, so the same action has different effects depending on timing.

Attack path: 1. After day 360 the first user calls withdrawRemainingTitn(), and the snapshot is taken. 2. The owner (or anyone, by plain transfer) then adds TITN. 3. The extra TITN is not counted in any later user payout.

Impact: The merge's accounting depends on when TITN arrives, and extra TITN can be left stranded under the owner's control.
