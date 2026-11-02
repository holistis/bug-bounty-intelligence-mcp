# Audit report

## [High] transferVesting resets grantor releaseRate ignoring amountClaimed, letting sellers over-claim from the pool

File: SecondSwap_StepVesting.sol
Function: transferVesting()

After reducing the grantor's totalAmount, transferVesting sets releaseRate = totalAmount / numOfSteps. It ignores amountClaimed and stepsClaimed, so the rate is not (totalAmount - amountClaimed) / (numOfSteps - stepsClaimed). claimable() then pays releaseRate * claimableSteps whenever stepsClaimed + claimableSteps < numOfSteps, with no cap at totalAmount - amountClaimed. A seller who has already claimed and then lists tokens (the marketplace moves them to the VestingManager through transferVesting) ends up with a rate that is too high for the tokens they still own. The seller can keep claiming that rate every step. amountClaimed then exceeds totalAmount, and the tokens come out of the contract's balance, which holds other users' and listed tokens.

Attack path: 1. A holder has total 100 over 10 steps and has claimed 5 steps (50 tokens). 2. They call listVesting for the full available 50. The manager calls transferVesting(seller, manager, 50), so total becomes 50 and releaseRate becomes 5, while amountClaimed stays 50. 3. At step 6 the seller calls claim() and receives 5 more. At step 9 they receive up to 20 more in total, although nothing is owed. 4. The pool is drained for other beneficiaries and buyers. The final claim and available() then revert on underflow.

Impact: Theft of vesting tokens held by the contract that belong to other beneficiaries and to buyers of listed tokens. The over-claimer's own vesting is also left in a broken state.

## [Medium] Referral reward is computed and emitted but never paid to the referrer

File: SecondSwap_Marketplace.sol
Function: _handleTransfers()

When _referral is non-zero and the listing has no whitelist, referralFeeCost is computed from buyerFeeTotal and referralFee. No transfer to _referral is ever made. The buyer pays baseAmount + buyerFeeTotal, the seller receives baseAmount - sellerFeeTotal, and feeCollector receives buyerFeeTotal + sellerFeeTotal in full. The referralFeeCost value only appears in the Purchased event. The formula (buyerFee minus the referral share) also does not clearly represent the referrer's payout.

Attack path: A buyer calls spotPurchase with a referral address. The referrer is credited in the event and receives nothing on chain. The whole fee goes to feeCollector.

Impact: The referral program does not pay out. Referrers lose the advertised rewards, and the event data misreports the amounts.

## [Medium] Private-listing whitelist is open self-registration, so the seller cannot choose buyers

File: SecondSwap_Whitelist.sol
Function: whitelistAddress()

For private listings the marketplace deploys a whitelist whose owner is the seller (lotOwner). The only way onto the whitelist is whitelistAddress(), which any address can call for itself while totalWhitelist < maxWhitelist. lotOwner can only raise maxWhitelist and cannot add, approve or remove addresses. spotPurchase accepts any address for which validateAddress is true.

Attack path: A seller creates a private listing for a chosen group with _maxWhitelist = N. Any address, including bots, calls whitelistAddress() first and fills the N slots. Those addresses can buy, and the intended buyers cannot be added.

Impact: Private sales cannot be restricted to intended buyers. Slots can be front-run or griefed, and the seller can only raise the cap.

## [Medium] Self-purchase of own listing inflates `bought` and bypasses maxSellPercent cap

File: SecondSwap_VestingManager.sol
Function: listVesting() / completePurchase()

The sell limit in `listVesting` is `bought + (total + sold - bought) * maxSellPercent / BASE`. `completePurchase` raises `allocations[buyer].bought` for any buyer and never reduces the seller's `sold`. The marketplace does not stop `msg.sender` from buying its own listing (`_validatePurchase` only checks buyer != referral). A seller can list the maximum, buy it back, and list again. Each round adds the repurchased amount to `bought` (`total` is restored and `sold` stays the same), so the limit keeps growing. The per-plan percentage cap that protects the issuer's schedule is therefore not enforced.

Attack path: 1) Seller holds T and lists 20% (sold = 0.2T). 2) Seller calls spotPurchase on its own listing, so bought += 0.2T and the tokens return to the seller. 3) Now total = T, sold = 0.2T, bought = 0.2T, so sellLimit = 0.2T + 0.2T = 0.4T. 4) Seller lists again and repeats until the whole allocation is listable. The only cost is the buyer and seller fees.

Impact: Holders can sell their entire allocation, defeating the issuer's maxSellPercent limit. The limit exists to prevent dumping and to limit secondary-market supply.

## [Medium] transferVesting resets grantor releaseRate ignoring claimed steps, allowing over-claim from pooled tokens

File: SecondSwap_StepVesting.sol
Function: transferVesting() (called via VestingManager.listVesting)

After a transfer, `grantorVesting.releaseRate = totalAmount / numOfSteps`. This ignores `amountClaimed` and `stepsClaimed`. For a holder who has already claimed s steps, the correct rate is `(total - amountClaimed) / (numOfSteps - stepsClaimed)`. The listing guard in the manager only checks `available >= amount`. `claimable()` pays `releaseRate * claimableSteps` and only caps at `total - amountClaimed` once the last step is reached. After selling part of the unclaimed balance, the rate times the remaining steps can exceed the remaining entitlement.

Attack path: 1) Holder with total 100 and N=10 claims at step 5, so claimed = 50 and stepsClaimed = 5. 2) Holder lists and sells x through the manager. Total becomes 100 - x and the rate becomes (100 - x)/10. 3) At step 9 the holder claims rate * 4 steps, which exceeds the entitlement of 50 - x when x > 0. For x = 20: claims 32 against an entitlement of 30. 4) The surplus comes out of the vesting contract's token balance, which belongs to other beneficiaries and to the pooled listed tokens. 5) A larger x (see the self-purchase bypass) makes the surplus larger. The holder's own final claim later reverts on `total - amountClaimed` underflow.

Impact: Other beneficiaries' tokens can be taken, which leaves the vesting contract insolvent. The seller's own later claims can brick.

## [Medium] Existing holder receiving vesting gets retroactive early unlock of purchased tokens (incoming stepsClaimed ignored)

File: SecondSwap_StepVesting.sol
Function: _createVesting() / transferVesting() / claimable()

When the beneficiary already has a vesting (totalAmount != 0), _createVesting ignores the `_stepsClaimed` passed from transferVesting. It adds the amount to totalAmount and sets releaseRate = (totalAmount - amountClaimed) / (numOfSteps - beneficiary.stepsClaimed). claimable() then pays releaseRate * (currentStep - beneficiary.stepsClaimed). Every step the beneficiary has not yet claimed is therefore retroactively applied to the newly received tokens. Those tokens came from a seller or from the manager pool who had already consumed or locked those earlier steps. The new-beneficiary branch honours the grantor's stepsClaimed, so behaviour differs depending on whether the buyer already holds a vesting.

Attack path: 1) A holder (or a Sybil wallet) keeps a small vesting and never claims, so stepsClaimed stays 0. 2) Late in the schedule (say step 8 of 10) the holder buys a large listing via spotPurchase, which calls completePurchase and then transferVesting(manager, buyer). 3) The else-branch raises releaseRate to (small + bought) / 10. 4) The buyer calls claim() and receives about 80% of the purchased tokens at once, although the seller's tokens at that stage still had the schedule of the seller or pool. The same applies to additions made through createVesting or the deployer.

Impact: Purchased vesting can be unlocked earlier than the issuer's schedule allows, which defeats the lock the token issuer relies on. Buyers who pre-seed a vesting can systematically beat the intended schedule.

## [Medium] Step duration rounds down to zero or leaves currentStep above numOfSteps, causing DoS or underflow

File: SecondSwap_StepVesting.sol
Function: constructor / claimable() / _createVesting()

stepDuration = (endTime - startTime) / numOfSteps is floored, and neither deployVesting nor the constructor checks it. If numOfSteps exceeds the duration, stepDuration is 0 and claimable() divides by zero on every call, so claim() always reverts. If the duration is not divisible by the step count, currentStep can exceed numOfSteps (for example, duration 10 with 4 steps gives stepDuration 2 and currentStep 5). claim() then stores stepsClaimed > numOfSteps. Later `numOfSteps - stepsClaimed` in _createVesting underflows and reverts, which blocks unlistVesting and purchases that merge into that holder's vesting.

Attack path: A token issuer calls deployVesting with steps greater than endTime - startTime, or with a non-divisible duration. Beneficiaries then cannot claim (zero case). In the non-divisible case, a holder who claims only after the end has stepsClaimed above numOfSteps. Any later transferVesting or createVesting into that holder reverts, so a listing they try to unlist, or a purchase into that holder, reverts.

Impact: Vested tokens become permanently unclaimable, or the holder is blocked from receiving or unlisting vestings.

## [Medium] Discount percentage is not validated, so a listing can become unpurchasable

File: SecondSwap_Marketplace.sol
Function: listVesting() / _getDiscountedPrice()

listVesting only requires discountPct > 0 when a discount type is chosen. It does not require discountPct <= BASE. With FIX and discountPct > BASE, `BASE - discountPct` underflows, so every spotPurchase reverts. With LINEAR, a large discountPct makes the buy revert once _amount * discountPct / total exceeds BASE. At exactly BASE the discounted price is 0, which fails the baseAmount > 0 check. The listing check for baseAmount > 0 also uses the undiscounted price.

Attack path: A seller creates a listing with discountPct above 10000. The tokens move into the manager and every purchase reverts until the seller unlists. Unlisting before minListingDuration costs the penalty fee.

Impact: Listings become unbuyable and the seller's tokens are locked until unlisted, possibly at the cost of the penalty fee.

## [Medium] Manager's pooled vesting carries first lister's stepsClaimed to all buyers and unlisters

File: SecondSwap_VestingManager.sol
Function: listVesting() / completePurchase() / unlistVesting()

All listed tokens from all sellers sit in a single vesting record for the manager address. That record's `stepsClaimed` is set only when it is created from empty, using the first lister's `stepsClaimed`. Later deposits from other sellers are merged without changing it. When a buyer with no existing vesting purchases, `transferVesting(manager, buyer)` passes the pool's `stepsClaimed` to `_createVesting`. The buyer's schedule therefore comes from an unrelated first lister rather than from the tokens' real seller. The same happens when a seller with no vesting record unlists. A pool created by a holder with stepsClaimed = 0 gives later buyers of late-stage tokens an immediately claimable `releaseRate * currentStep` portion. A pool with a high stepsClaimed delays buyers of early-stage tokens.

Attack path: 1) Attacker keeps a tiny listing with stepsClaimed = 0 open so the pool never empties. 2) Another holder who has claimed 8 of 10 steps lists their remaining tokens. 3) A new buyer (or the attacker) buys them and gets stepsClaimed = 0 with rate amt/10. 4) The buyer immediately claims 8/10 of tokens that were scheduled for steps 9-10. In the reverse case, other buyers are locked longer.

Impact: The issuer's vesting schedule is bypassed through accelerated release. Other buyers can be locked unfairly. Outcomes depend on the order of listings from unrelated users.

## [Medium] Whitelist for private listings is open self-registration, so access control is ineffective and can be griefed

File: SecondSwap_Whitelist.sol
Function: whitelistAddress() / setMaxWhitelist()

`whitelistAddress()` has no authorization. Any address can add itself until `totalWhitelist == maxWhitelist`. The lot owner can only raise `maxWhitelist` and has no way to add, approve or remove addresses. The marketplace's `_validatePurchase` treats `validateAddress(msg.sender)` as proof of an invited buyer. Anyone can register and buy in the same transaction flow. Sybil addresses can also fill the capacity before intended buyers do.

Attack path: 1) Seller creates a private listing with maxWhitelist = N. 2) An attacker calls `whitelistAddress()` from N addresses, or just calls it for itself and buys. 3) The invited buyers cannot register. The seller can raise the max, but the attacker refills it.

Impact: Private (invite-only) sales cannot be enforced. Intended buyers can be locked out, and the listing's discounted private price is open to anyone.

## [Medium] setTokenOwner is irreversible and one-shot per owner, with broad token-owner power over vestings

File: SecondSwap_VestingDeployer.sol
Function: setTokenOwner() / transferVesting()

setTokenOwner requires _tokenOwner[_owner] == address(0) and has no way to change or revoke an entry. Permissions are checked only by comparing _tokenOwner[msg.sender] with the token of the supplied _stepVesting. They are not tied to the specific vesting contract or to its tokenIssuer. Any owner of token X can call transferVesting on any vesting of token X, with an arbitrary _grantor. A compromised or mistaken owner entry cannot be removed.

Attack path: The admin maps an owner key to a token. If that key is compromised, the attacker calls the deployer's transferVesting(victim, attacker, amount, stepVesting, id) and moves any holder's unclaimed vesting. Admin cannot revoke the mapping.

Impact: Holders' vestings can be seized by a compromised owner key, and the mapping cannot be fixed without an upgrade.

## [Medium] Transfer into a fresh vesting from a grantor with all steps claimed reverts with division by zero

File: SecondSwap_StepVesting.sol
Function: _createVesting()

In the new-beneficiary branch, releaseRate is `_totalAmount / (numOfSteps - _stepsClaimed)` with no guard. transferVesting passes the grantor's stepsClaimed. A holder who claimed after the end already has stepsClaimed == numOfSteps. If that holder later receives more vesting, the else-branch only sets releaseRate = 0, and claimable() would release the rest immediately. Any transfer from that holder to a beneficiary with totalAmount == 0 hits a division by zero. This includes VestingManager.listVesting when the manager's pool is empty, and unlistVesting when the seller's totalAmount is 0.

Attack path: A user who has fully claimed (stepsClaimed == numOfSteps) buys or receives more tokens and tries to list them while the manager pool is empty. Marketplace.listVesting calls manager.listVesting, which calls transferVesting and then _createVesting, and this panics. The same path breaks token-owner transfers from such a grantor to fresh addresses.

Impact: Affected holders cannot list or transfer their vesting to fresh addresses. The impact is limited to a per-user denial of service, with no fund loss.

## [Medium] Default penaltyFee of 10 ether is applied to a 6-decimal USDT, making early unlisting impossible

File: SecondSwap_MarketplaceSetting.sol
Function: constructor / Marketplace.unlistVesting()

The constructor sets penaltyFee = 10 ether (1e19 base units) and the penalty is paid in `usdt`, which is normally a 6-decimal token. unlistVesting requires usdt.balanceOf(msg.sender) >= penaltyFee during the first minListingDuration seconds. With the default, that is about 1e13 USDT, so the check fails for everyone except the admin. Sellers therefore cannot cancel a listing in that window at all, and the 'penalty' acts as a hard block. The fee is also not scaled to the token's decimals anywhere.

Attack path: A seller lists at the wrong price or wants to cancel right after listing. unlistVesting reverts with 'Penalty fee required for early unlisting' until minListingDuration has passed, unless the admin intervenes or sets setPenaltyFee in USDT units.

Impact: Sellers cannot correct a mispriced listing during the minimum-duration window, so buyers can snipe it. The penalty mechanism is misconfigured by default.

## [Medium] Replacing the vesting manager desyncs existing StepVesting authorisations and strands listed tokens

File: SecondSwap_MarketplaceSetting.sol
Function: setManager()

Marketplace resolves the vesting manager dynamically through MarketplaceSetting.vestingManager(). Each StepVesting stores `manager` once in its constructor and has no setter, and only that address (or the issuer or deployer) may call transferVesting. After setManager() points the settings at a new manager, the new manager is not authorised in existing StepVesting contracts. Tokens already pooled under the old manager, and the old manager's `allocations`/`vestingSettings`, are not migrated. Active listings then cannot be bought or unlisted: completePurchase and unlistVesting go to the new manager, which holds nothing and is unauthorised. VestingDeployer.setManager creates a similar desync for newly deployed vestings.

Attack path: The admin calls setManager (or the manager is redeployed) while listings exist. Buyers' spotPurchase reverts at completePurchase, sellers' unlistVesting reverts, and the old manager has no path to return the tokens.

Impact: Seller tokens in open listings become stuck, and the marketplace is bricked for all existing vesting plans until a privileged manual recovery.
