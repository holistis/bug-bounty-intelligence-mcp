# Audit report

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
