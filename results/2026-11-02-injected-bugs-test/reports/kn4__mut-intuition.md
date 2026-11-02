# Audit report

## [High] Anyone can call VotingEscrow.unlock() and release every lock early

File: VotingEscrow.sol
Function: unlock()

`unlock()` is `external` with no role check, so any address can set `unlocked = true`. `_withdraw()` skips the `block.timestamp > _locked.end` check when `unlocked` is true, so every user can withdraw immediately. The same flag disables `create_lock`, `increase_amount`, `increase_unlock_time`, `deposit_for`, `checkpoint` and `withdraw_and_create_lock` through the `notUnlocked` modifier. There is no function to reset the flag.

Attack path: 1. An attacker calls `unlock()`. 2. All lockers can withdraw before their lock ends, and no new locks can be created. 3. Because `unlocked` is never reset, the contract stays unusable permanently.

Impact: Time-lock commitments are destroyed with a single call. Voting-escrow based incentives and boosts, including TrustBonding, break. The contract can never be used for locking again.

## [High] setMetaERC20SpokeOrHub in SatelliteEmissionsController has no access control

File: SatelliteEmissionsController.sol
Function: setMetaERC20SpokeOrHub()

Every other admin setter has `onlyRole(DEFAULT_ADMIN_ROLE)`, but `setMetaERC20SpokeOrHub` is `external` with no modifier. It writes `_metaERC20SpokeOrHub`, the bridge router that `bridgeUnclaimedEmissions` uses in `_bridgeTokensViaNativeToken`. That call forwards the native token amount (the unclaimed emissions) plus gas.

Attack path: 1. The attacker calls `setMetaERC20SpokeOrHub(attackerContract)`. 2. The operator later calls `bridgeUnclaimedEmissions(epoch)`. 3. The satellite sends the unclaimed TRUST to the attacker's contract instead of the real router, and `_reclaimedEmissions[epoch]` is already set. Alternatively, the attacker sets a router that always reverts, which blocks bridging.

Impact: Theft of bridged unclaimed emissions, or denial of service on bridging back to the base controller.

## [Medium] TrustToken.mint never enforces the per-minter caps

File: TrustToken.sol
Function: mint()

`mint` computes `minterCap` (49% for MINTER_A, 51% for MINTER_B) but never compares it with `minterAmountMinted[msg.sender] + amount`. The only check is the global `totalMinted + amount <= MAX_SUPPLY`. The `ExceedsMinterCap` error is declared but never used.

Attack path: 1. MINTER_A (or B) calls `mint` for more than its share. 2. The call succeeds until `totalMinted` reaches `MAX_SUPPLY`. 3. The other minter's allocation is consumed.

Impact: The intended 49/51 split of the supply between minters is not enforced. One minter, or its compromised key, can mint the whole supply.

## [Medium] VotingEscrow.deposit_for pulls tokens from the target address, not from the caller

File: VotingEscrow.sol
Function: deposit_for()

`deposit_for(_addr, _value)` can be called by anyone and passes `_addr` to `_deposit_for`. That function executes `safeTransferFrom(_addr, address(this), _value)`, so the tokens come from `_addr` and not from `msg.sender`. Any account that has approved the VotingEscrow and has an unexpired lock can have extra tokens forced into its lock by a third party.

Attack path: 1. A victim holds an active lock and has a leftover or unlimited TRUST allowance to the VotingEscrow. 2. An attacker calls `deposit_for(victim, amount)`. 3. The victim's TRUST is moved into their lock against their will.

Impact: Users' liquid TRUST can be force-locked until their lock end. This also lets an attacker manipulate the victim's voting weight and any epoch-based reward share that depends on it.

## [Medium] Satellite unclaimed-emission accounting depends on unverified TrustBonding state

File: SatelliteEmissionsController.sol
Function: withdrawUnclaimedEmissions()/bridgeUnclaimedEmissions()

Both functions read `getUnclaimedRewardsForEpoch(epoch)` from TrustBonding and mark `_reclaimedEmissions[epoch] = amount`. They do not check that the epoch has ended or that the amount cannot still be claimed through `transfer`. TrustBonding is not in scope and was not available, so I could not verify this. If TrustBonding does not read `_reclaimedEmissions`, or the epoch is still open, TRUST is both reclaimed and later claimable. The controller then becomes insolvent for later claims.

Attack path: 1. The admin or operator reclaims unclaimed rewards for an epoch that is still claimable. 2. Users then try to claim through the CONTROLLER_ROLE `transfer`. 3. The satellite balance is insufficient and claims revert.

Impact: Possible double-spend of emissions or claim failures for users.

## [Medium] totalSupplyAtT reverts for timestamps before the first checkpoint instead of returning zero

File: VotingEscrow.sol
Function: _totalSupply()/_supply_at()/_find_timestamp_epoch()

_find_timestamp_epoch is documented to return 0, meaning zero supply, when `_ts < point_history[0].ts`. _totalSupply then loads point_history[0], whose ts is the initialization timestamp, and passes it to _supply_at(point, t) with t earlier than point.ts. In _supply_at the first loop pass sets t_i = t because t_i > t. It then computes `t_i - last_point.ts`, which is an unsigned subtraction that underflows and reverts under 0.8.29 checked arithmetic. The same revert happens when `max_epoch == 0` and t is before point_history[0].ts. The result is a revert where the documented behavior is a zero return. The dead check `_ts < user_point_history[addr][0].ts` in _find_user_timestamp_epoch is never true because index 0 is always empty, so the user-side function behaves differently.

Attack path: Any caller, or a dependent contract such as a bonding or reward module, calls totalSupplyAtT(t) with t earlier than the VotingEscrow initialization time. This can happen when an epoch schedule starts before the escrow was deployed or initialized. The call reverts. If reward or epoch logic needs that total supply, it cannot proceed, and a reward calculation for that epoch can be blocked.

Impact: Reward or epoch calculations that query total voting power at a pre-initialization timestamp revert instead of treating the supply as zero. This can block claims or checkpoints for the affected epochs. Whether this applies in practice depends on TrustBonding's epoch start relative to escrow initialization, which I could not read.
