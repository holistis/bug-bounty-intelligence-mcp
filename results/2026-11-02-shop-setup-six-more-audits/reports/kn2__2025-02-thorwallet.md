# Audit report

## [Medium] Merge credits claimable TITN with no check against TITN balance; late depositors lose TGT

File: MergeTgt.sol
Function: onTokenTransfer()

onTokenTransfer increases claimableTitnPerUser[from] and totalTitnClaimable by quoteTitn(amount) without checking that totalTitnClaimable stays within the TITN held by the contract. The contract only ever receives TITN_ARB (173.7M) via deposit(), and that amount covers exactly 579M TGT at the full rate. TGT is not capped at 579M, because the total TGT supply is larger and nothing limits deposits. Once more TGT than that has been merged, later users have their TGT taken and credited. claimTitn() then reverts on safeTransfer because the TITN balance is too low. There is also no refund path for the TGT.

Attack path: 1. Users merge TGT at the 90-day full rate until the cumulative claimable exceeds the TITN held. 2. A later depositor calls TGT.transferAndCall(merge, amount) and is credited. 3. Early claimers drain the TITN. 4. The late user's claimTitn() reverts, and TGT stays locked in the merge contract.

Impact: Users permanently lose TGT without receiving TITN. The first-come-first-served outcome is not disclosed to users. A whale can also use up the allocation.

## [Medium] Anyone can permanently flag any address as bridged-token holder, locking its transfers

File: Titn.sol
Function: _credit()

_credit sets isBridgedTokenHolder[_to] = true for any recipient of an incoming LayerZero message. Nothing ever clears the flag. Any user can bridge a dust amount to an arbitrary victim address on a destination chain. While isBridgedTokensTransferLocked is true, _validateTransfer then blocks every transfer from that victim, including balances the victim got by non-bridged means. Transfers to the allowed contract, the endpoint, or from the owner are still permitted. The flag also cannot be removed by the owner, because no setter for isBridgedTokenHolder exists.

Attack path: 1. The attacker calls send() on a Titn OFT on another chain with the victim as recipient and 1 wei. 2. _credit on the destination chain mints the tokens and sets isBridgedTokenHolder[victim] = true. 3. The victim's transfer()/transferFrom() calls revert with BridgedTokensTransferLocked for as long as the lock is on.

Impact: Third parties can freeze arbitrary users' tokens, including contracts such as AMM pools and vaults that hold TITN. The flag stays after the lock is lifted and is applied again if the lock is re-enabled.

## [Medium] Owner withdraw() can pull TITN that backs user claims, including after the post-1-year snapshot

File: MergeTgt.sol
Function: withdraw()

withdraw(token, amount) lets the owner send any amount of any token, including TITN, to himself. It does not check against totalTitnClaimable, and it does not update remainingTitnAfter1Year, initialTotalClaimable or any claim counter. The TITN the contract owes (totalTitnClaimable plus the bonus pool) and the contract's real TITN balance can therefore diverge at any time. After the first withdrawRemainingTitn() call has fixed remainingTitnAfter1Year, later users' payouts are computed from that stale snapshot. If the owner has removed TITN since the snapshot, the safeTransfer reverts for the users who come last.

Attack path: 1. Users merge TGT and accrue claimableTitnPerUser. 2. After 360 days the first user calls withdrawRemainingTitn(), which snapshots remainingTitnAfter1Year and initialTotalClaimable. 3. The owner calls withdraw(titn, balance) or a large part of it. 4. Remaining users call claimTitn or withdrawRemainingTitn, and their transfers revert or pay out less than owed. The owner can also drain the TITN before users claim, while keeping the TGT they paid in.

Impact: Users who deposited TGT can lose all of their TITN entitlement. The owner can keep both the TGT and the TITN.

## [Medium] withdrawRemainingTitn can underflow/brick if TITN balance is below total claimable

File: MergeTgt.sol
Function: withdrawRemainingTitn()

The first call snapshots remainingTitnAfter1Year = titn.balanceOf(this) and initialTotalClaimable = totalTitnClaimable. It then computes remainingTitnAfter1Year - initialTotalClaimable with no guard. If the balance is lower than the outstanding claimable amount, the subtraction reverts for every user. This happens when TGT over-subscription occurs, or when the owner has used withdraw() on TITN. Every claimant is then permanently blocked, because claimTitn is disabled after 360 days. The snapshot also keys off remainingTitnAfter1Year == 0, so a zero-balance first call is not recorded and the snapshot can be re-initialised later.

Attack path: 1. The merge is over-subscribed or the owner withdraws some TITN. 2. After 360 days any user calls withdrawRemainingTitn(). 3. The call reverts on the underflow in unclaimedTitn, so no one can claim.

Impact: All remaining claimable TITN is locked, including for users whose claims could otherwise have been paid.

## [Medium] Leftover-TITN bonus is shared pro rata to claimable, so dust or late depositors capture unmerged TITN

File: MergeTgt.sol
Function: withdrawRemainingTitn()

After 360 days each user receives claimableTitn + claimableTitn * (remainingTitnAfter1Year - initialTotalClaimable) / initialTotalClaimable. The pool is all TITN not owed to anyone, namely the 173.7M deposit minus the claimable total. That pool is split in proportion to claimableTitnPerUser only. The multiplier unclaimed/initialTotalClaimable is unbounded. It is large whenever few TGT were merged. The pool does not depend on when a user deposited or on how much TGT they paid at the full 1:0.3 rate. The decaying quote in quoteTitn is therefore irrelevant for the bonus, since a deposit made on day 359 earns a bonus share proportional to its decayed claimable amount.

Attack path: 1. Participation is low, so most of the 173.7M TITN stays unmerged. 2. The attacker deposits a small amount of TGT via transferAndCall. 3. After day 360 the attacker calls withdrawRemainingTitn(). 4. The attacker's claimable is a large fraction of initialTotalClaimable, so they receive a bonus of up to nearly the whole unclaimed pool. A whale can also deposit late to dilute earlier depositors' share of the pool.

Impact: The pool of unmerged TITN is captured by whoever holds the largest share of claimable. Payouts are many times the TGT-to-TITN rate, and the outcome depends on a single user.

## [Medium] No minimum-output protection; deposits can yield zero TITN and TGT is lost

File: MergeTgt.sol
Function: onTokenTransfer()/quoteTitn()

onTokenTransfer takes the TGT and credits quoteTitn(amount) with no minimum-output check. The rate decays linearly after day 90, and at timeSinceLaunch == 360 days quoteTitn returns 0 while the call still succeeds because the check is `> 360 days`. Small amounts also round to 0. The user's TGT is kept by the contract, and no refund function exists. Because the rate depends on block.timestamp, a delayed transaction receives a worse rate than the user expected.

Attack path: 1. A user sends TGT by transferAndCall near or at the end of the window, or a tiny amount, or the tx is delayed past day 90. 2. quoteTitn returns a lower value or 0. 3. The call succeeds and the TGT is kept.

Impact: Loss of user TGT and unexpected rates.

## [Medium] Early claimTitn() forfeits the user's share of the leftover bonus, so claimants are treated unequally

File: MergeTgt.sol
Function: claimTitn()/withdrawRemainingTitn()

claimTitn moves tokens from claimableTitnPerUser to claimedTitnPerUser and lowers totalTitnClaimable. The bonus in withdrawRemainingTitn is computed only from the user's remaining claimableTitnPerUser and from initialTotalClaimable, a snapshot of the remaining claimable total. A user who claims before day 360 gets 1x their quote. A user who waits and calls withdrawRemainingTitn gets 1x plus a share of the unmerged TITN. Claiming early therefore costs the user their bonus, and the leftover pool is shifted to the users who did not claim. The two claim paths give different totals for identical deposits.

Attack path: Two users deposit the same TGT at the same time. User A calls claimTitn(full amount) at day 100. User B waits and calls withdrawRemainingTitn() after day 360. B receives more TITN than A. A can no longer reach the bonus, because claimableTitnPerUser[A] is 0.

Impact: The payout depends on the claim path, not only on the TGT deposited. Users who claim early lose value, and the claim function is a trap.

## [Medium] Titn restrictions depend on transferAllowedContract being set to MergeTgt, and the default blocks claimTitn on Arbitrum

File: Titn.sol
Function: _validateTransfer()

On chainid 42161, _validateTransfer reverts for every transfer unless from is the owner, from is transferAllowedContract, to is transferAllowedContract or to is lzEndpoint. transferAllowedContract defaults to address(0). MergeTgt.claimTitn and withdrawRemainingTitn pay out with titn.safeTransfer from the Merge contract. Those transfers revert while transferAllowedContract is not set to MergeTgt, and the contract does not guarantee that it is set. Merge.deposit by the owner works because the owner is exempt. If the owner later changes transferAllowedContract to another address, all pending claims revert.

Attack path: 1. Titn is deployed on Arbitrum with isBridgedTokensTransferLocked = true. 2. MergeTgt is funded and users merge TGT. 3. setTransferAllowedContract was not called or was changed. 4. Every claimTitn and withdrawRemainingTitn call reverts with BridgedTokensTransferLocked. After 360 days claimTitn is closed for good. withdrawRemainingTitn still works once the setter is fixed, but only until a later owner change breaks it again.

Impact: Users' TITN is stuck, and the bonus accounting can be affected, if the configuration is wrong. This is a liveness risk and not a fund-theft bug.
