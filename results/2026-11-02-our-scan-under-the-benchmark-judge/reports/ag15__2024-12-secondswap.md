# Audit report

## [High] transferVesting recomputes grantor releaseRate as totalAmount/numOfSteps, letting sellers over-claim others' tokens

File: SecondSwap_StepVesting.sol
Function: transferVesting()

After reducing grantorVesting.totalAmount by _amount, the grantor's releaseRate is set to grantorVesting.totalAmount / numOfSteps. This ignores both amountClaimed and stepsClaimed, unlike _createVesting which uses (totalAmount - amountClaimed) / (numOfSteps - stepsClaimed). claimable() pays releaseRate * claimableSteps for every non-final step without capping at totalAmount - amountClaimed; only the final step is capped. If the grantor already claimed part of the vesting and then lists most of the rest, releaseRate * remainingSteps can be far larger than the remaining balance. claim() then transfers tokens that belong to other beneficiaries, including the VestingManager's listed tokens, and amountClaimed ends up larger than totalAmount.

Attack path: 1) Seller has 1000 tokens over 10 steps (rate 100) and claims 8 steps (800 claimed). 2) Seller calls Marketplace.listVesting for 200, which fits the default 20% sell limit and the 200 available. VestingManager.listVesting -> transferVesting sets total=800 and releaseRate=800/10=80, while the remaining balance is 0. 3) At step 9 (not final, 8+1<10) the seller calls claim(), and claimable returns 80, which is transferred from tokens belonging to others. The larger the maxSellPercent or the bought allocation, the more is stolen. 4) After a buyer purchases the listing, or other users try to claim, the contract runs short of tokens.

Impact: Direct theft of vested tokens held by the StepVesting contract for other beneficiaries and buyers; the contract becomes insolvent for later claimers.

## [High] Buyers inherit the VestingManager's stale stepsClaimed, so locked tokens unlock early or unlocked ones lock again

File: SecondSwap_StepVesting.sol
Function: transferVesting() / _createVesting()

transferVesting calls _createVesting(_beneficiary, _amount, grantorVesting.stepsClaimed, true). The VestingManager's vesting entry is created once, with the stepsClaimed of whichever seller listed first, and is never updated after that (the else branch of _createVesting does not touch stepsClaimed and the manager never claims). Every new buyer then gets the manager's stale stepsClaimed and releaseRate = amount/(numOfSteps - stepsClaimed), whatever the vesting progress of the seller whose tokens they bought. If the manager's stepsClaimed is 0, a buyer can immediately claim currentStep*rate of tokens that were still locked for the seller. If it is high, a buyer of fresh tokens has them locked until later, and claim() underflows (currentStep - stepsClaimed) until then. If it equals numOfSteps, creating the entry divides by zero.

Attack path: 1) Early in the vesting, a seller with stepsClaimed=0 lists, which creates the manager entry with stepsClaimed=0. 2) Later, at step 8 of 10, seller B, who has claimed 8 steps, lists their locked remainder. 3) A fresh buyer (possibly B's second address) buys it and gets stepsClaimed=0 with rate amount/10, so they can claim 80% at once. B has effectively unlocked locked tokens through the marketplace. In the reverse order, honest buyers get their purchased unlocked tokens delayed.

Impact: The vesting schedule can be bypassed (locked tokens become liquid at once), or buyers lose access to tokens they paid for until later steps; reverts can block purchases and listings.

## [Medium] Referral reward is computed (with inverted formula) but never paid

File: SecondSwap_Marketplace.sol
Function: _handleTransfers()

referralFeeCost is computed as buyerFeeTotal - (baseAmount*bfee*referralFee)/(BASE*BASE), which is 90% of the buyer fee for referralFee=1000 rather than the intended 10%. The value is only returned and emitted in Purchased. No transfer to _referral or to referralFeeCollector is ever made, and the whole buyerFeeTotal + sellerFeeTotal goes to feeCollector. Off-chain systems reading the event see rewards that were never paid on-chain.

Attack path: Any buyer passes a referral address to spotPurchase; the referrer gets nothing, while the event claims about 90% of the buyer fee was paid.

Impact: Referrers are never paid, and the emitted accounting is wrong, which may lead to wrong off-chain payouts.

## [Medium] Private-listing whitelist lets anyone add themselves, so private sales are not private

File: SecondSwap_Whitelist.sol
Function: whitelistAddress()

whitelistAddress() has no access control: any address can call it and set userSettings[msg.sender]=true until totalWhitelist reaches maxWhitelist. lotOwner has no function to add or remove specific addresses, only to raise maxWhitelist. Marketplace._validatePurchase relies only on validateAddress(msg.sender) for private listings.

Attack path: 1) Seller creates a private listing intended for chosen buyers. 2) An outsider calls whitelistAddress() on the deployed whitelist, or fills all slots with Sybil addresses. 3) The outsider buys the private listing, or intended buyers cannot register.

Impact: Private (OTC) listings can be bought by arbitrary users, or the whitelist can be squatted so intended buyers are blocked.

## [Medium] maxSellPercent cap can be bypassed by buying back one's own listing

File: SecondSwap_VestingManager.sol
Function: listVesting()

sellLimit = bought + (currentAlloc + sold - bought) * maxSellPercent / BASE, and every token in allocations[user][plan].bought is 100% sellable. Nothing prevents a seller from buying their own listing (spotPurchase does not check msg.sender != listing.seller). A self-purchase adds the amount to bought and returns it to the seller's vesting, so the same tokens become fully sellable, while sold stays counted only once in the original-allocation term.

Attack path: 1) Seller lists the max 20% of the allocation. 2) Seller buys it back from another address, or the same one, paying only fees. 3) Bought tokens now count as 100% sellable; repeat the list and self-buy steps until the whole allocation is listable.

Impact: The issuer-configured sell cap on locked allocations (anti-dumping) can be bypassed for the cost of fees.

## [Medium] stepDuration rounding to 0 or below numOfSteps breaks claims and transfers

File: SecondSwap_StepVesting.sol
Function: constructor / claimable()

stepDuration = (_endTime - _startTime) / _numOfSteps is floored, and VestingDeployer only checks startTime < endTime and steps > 0. If numOfSteps > duration, stepDuration is 0 and claimable() divides by zero, so every claim reverts and the deposited tokens are locked. If stepDuration < numOfSteps, currentStep at endTime exceeds numOfSteps, so stepsClaimed can be set above numOfSteps by claim(). After that, numOfSteps - stepsClaimed underflows in _createVesting, which makes unlist and purchase transfers to that user revert.

Attack path: Issuer deploys a vesting with a short duration relative to steps; beneficiaries then cannot claim, or after a claim past the end their listed tokens cannot be unlisted back to them.

Impact: Funds locked, or listings stuck, for that vesting plan.

## [High] transferVesting resets releaseRate to totalAmount/numOfSteps, letting a seller claim more than totalAmount

File: SecondSwap_StepVesting.sol
Function: transferVesting()

After moving tokens out, transferVesting sets grantorVesting.releaseRate = grantorVesting.totalAmount / numOfSteps. totalAmount still contains the already claimed tokens and stepsClaimed is not reset, so the rate is too high whenever the grantor has claimed before (the fair value, as in the else-branch of _createVesting, is (totalAmount - amountClaimed) / (numOfSteps - stepsClaimed)). claimable() only falls back to totalAmount - amountClaimed on the final step; for every earlier step it pays releaseRate * claimableSteps with no cap against totalAmount - amountClaimed. Example with numOfSteps 10: totalAmount 1000, stepsClaimed 5, amountClaimed 500; the seller lists 200 (the default 20 percent cap), so totalAmount becomes 800 and releaseRate 80; claiming at step 9 pays 4 * 80 = 320 and amountClaimed becomes 820, above totalAmount 800. In the extreme case stepsClaimed 8, amountClaimed 800: the seller lists their last 200 (totalAmount 800 = amountClaimed) and can still claim 80 at step 9. The same wrong formula runs when the token issuer reallocates from a holder via transferVesting (reallocation itself is a known power, the rate formula is not).

Attack path: 1) A holder claims for five or more steps so amountClaimed*numOfSteps exceeds totalAmount*(stepsClaimed+1) after a sale. 2) The holder calls Marketplace.listVesting for up to the 20 percent cap, preferably at a dust price; VestingManager.listVesting calls transferVesting(seller, manager, amount) and the seller releaseRate becomes totalAmount/numOfSteps. 3) A second wallet of the attacker (or any honest buyer) buys the listing with spotPurchase, so the escrowed tokens leave the pool backed by the buyer allocation (a pure list and unlist cycle does not realise the theft, because unlistVesting goes through the fair else-branch of _createVesting). 4) The seller calls claim() near the end; claimableSteps * releaseRate is paid straight from the pooled token balance of the vesting contract, which also backs every other beneficiary. 5) The attacker own later claimable() and available() revert on the underflow of totalAmount - amountClaimed, and the last honest claimer finds the contract short of tokens so token.safeTransfer in claim() reverts.

Impact: Theft of other beneficiaries tokens from the shared vesting contract (about 2 to 10 percent of the seller allocation per sale in default configuration, more if the issuer raises maxSellPercent), leaving the plan insolvent and the last claimers unable to claim their tokens. Breaks the stated invariant that all locked tokens stay allocated and claimable.

## [Medium] Marketplace never pays the referral reward; fee is fully sent to feeCollector and formula is inverted

File: SecondSwap_Marketplace.sol
Function: _handleTransfers()

_handleTransfers computes referralFeeCost = buyerFeeTotal - (baseAmount * bfee * referralFee) / (BASE * BASE) but never transfers anything to _referral. The full buyerFeeTotal and sellerFeeTotal are sent to feeCollector (feeCollectorTotal = buyerFeeTotal + sellerFeeTotal), so no referrer is ever paid. The variable is only returned and emitted in the Purchased event, which therefore reports a reward that was not paid. The formula is also inverted: it yields buyerFeeTotal minus the referral share instead of the referral share (buyerFeeTotal * referralFee / BASE). referralFeeCollector in SecondSwap_MarketplaceSetting is never set or used either.

Attack path: A buyer calls spotPurchase on a public listing with a non-zero _referral. The buyer pays baseAmount + buyerFeeTotal, the seller gets baseAmount - sellerFeeTotal, feeCollector gets both fees, and the referrer receives nothing while the event shows a referralReward.

Impact: The advertised referral incentive does not work: referrers are not paid and off-chain indexers relying on the Purchased event see wrong reward amounts. Platform fee accounting is wrong compared with the documented design.

## [Medium] Pooled escrow entry of the VestingManager gives every buyer the stepsClaimed of the first lister

File: SecondSwap_StepVesting.sol
Function: _createVesting()

All listed tokens of all sellers sit in one Vesting entry of the VestingManager address. _createVesting only copies the incoming stepsClaimed when totalAmount == 0 (new entry); once the escrow entry exists, later listings from sellers with another stepsClaimed take the else-branch and the entry keeps the stepsClaimed of whoever listed first while the escrow was empty. transferVesting then hands grantorVesting.stepsClaimed of that pooled entry to a new buyer, with releaseRate = amount / (numOfSteps - stepsClaimed), instead of the stepsClaimed of the seller whose tokens are being bought. Likewise, a buyer who already has an entry (else-branch) ignores the incoming step position and vests the purchased tokens on his own stepsClaimed. A first lister at stepsClaimed 0 (can keep a tiny listing open) lets later buyers of sellers at high stepsClaimed claim currentStep/numOfSteps of the seller still-locked share at once; a first lister at a high stepsClaimed delays buyers who paid the full price until the last steps.

Attack path: 1) The attacker lists a tiny amount from a wallet that never claimed (stepsClaimed 0) and leaves it open, so the escrow entry has stepsClaimed 0. 2) A whale seller who already claimed (stepsClaimed 8 of 10) lists 20 percent to a second wallet of his own. 3) The second wallet buys it; the new entry gets stepsClaimed 0 and releaseRate = amount / 10, so at step 9 it claims 90 percent of tokens that the seller own schedule would only release at step 10. In the other direction an honest buyer of a stepsClaimed 0 seller whose escrow entry was opened at stepsClaimed 9 can only claim at the last step.

Impact: Unlock timing of sold tokens does not follow the plan: sellers can unlock locked tokens early through a second wallet, and buyers can receive a much later schedule than the seller position implies. Total amounts stay correct, but the vesting schedule guarantee is broken and depends on listing order.

## [Medium] stepDuration can be zero or too small, bricking claims and further vesting for a plan

File: SecondSwap_StepVesting.sol
Function: constructor()

The constructor computes stepDuration = (_endTime - _startTime) / _numOfSteps with no lower bound, and SecondSwap_VestingDeployer.deployVesting only checks startTime < endTime and steps > 0. If numOfSteps is larger than the duration in seconds, stepDuration is 0 and claimable() divides by zero (elapsedTime / stepDuration), so claim() reverts for every beneficiary and all tokens of the plan stay locked forever. When the division has a remainder that is at least stepDuration, currentStep at endTime becomes larger than numOfSteps, so stepsClaimed can end above numOfSteps after a late claim and later calls of _createVesting revert on numOfSteps - stepsClaimed (no further purchase or top-up for that user), while numOfSteps is reached earlier than endTime.

Attack path: A token issuer (or an issuer mistake) calls deployVesting with steps greater than endTime - startTime; the plan is made sellable and users get vestings, but every claim() reverts on the division by zero.

Impact: Permanent lock of all tokens in the plan, including the tokens of buyers who paid on the marketplace. README lists extremes of duration and number of cycles as a concern.

## [Medium] listVesting accepts discountPct above BASE or equal to it, making every purchase revert

File: SecondSwap_Marketplace.sol
Function: listVesting()

listVesting only requires _discountPct > 0 for LINEAR and FIX, with no upper bound. _getDiscountedPrice computes BASE - listing.discountPct (FIX) or BASE - (_amount * discountPct) / total (LINEAR). With discountPct above BASE the subtraction underflows and spotPurchase reverts for FIX and for any LINEAR purchase large enough; with FIX and discountPct equal to BASE the price is 0 and _handleTransfers reverts with Amount too little. The tokens are already moved into escrow by VestingManager.listVesting.

Attack path: A seller (by mistake, or through a front-end that sends a percentage in another scale) lists with discountType FIX and discountPct 10001. The listing is created and the tokens escrowed, but no buyer can ever purchase. The seller must unlist and pay the early unlisting penalty if still inside minListingDuration.

Impact: Listings that can never trade while the seller allocation is locked in escrow until unlisted; possible penalty loss. README asks whether conflicting discount parameters are reverted.

## [Medium] Early unlisting penalty defaults to 10 ether, which is unpayable in a 6 decimals USDT

File: SecondSwap_MarketplaceSetting.sol
Function: constructor()

penaltyFee is initialised as 10 ether (1e19 base units) and unlistVesting charges it in settings usdt via safeTransferFrom after requiring usdt.balanceOf(msg.sender) >= penaltyFee. On the target chains (Ethereum, Base, Arbitrum, zkSync) USDT has 6 decimals, so the penalty equals 10 trillion USDT and no seller can pay it. Until the admin notices and calls setPenaltyFee, any non-admin unlist inside minListingDuration reverts.

Attack path: A seller lists, sees the price move against him, and calls unlistVesting inside minListingDuration; the balance check fails for every user, so the escrowed vesting cannot be withdrawn until the window passes or the admin intervenes.

Impact: Sellers cannot cancel listings during the minimum listing window; the window is 120 seconds by default but the admin can raise it, and the penalty path is unusable until setPenaltyFee is called.
