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

## [High] transferVesting sets grantor releaseRate = totalAmount/numOfSteps, so claims overdraw after a partial listing

File: SecondSwap_StepVesting.sol
Function: transferVesting()

transferVesting() reduces grantorVesting.totalAmount by _amount and then sets grantorVesting.releaseRate = totalAmount / numOfSteps. The same contract's _createVesting() uses (totalAmount - amountClaimed) / (numOfSteps - stepsClaimed) for the same kind of update, so the two paths disagree. The transferVesting formula ignores amountClaimed and stepsClaimed, so it counts tokens that were already paid out. claimable() then pays releaseRate * claimableSteps without capping at totalAmount - amountClaimed, so amountClaimed can exceed totalAmount. Once that happens, the catch-all branch and available() compute totalAmount - amountClaimed and underflow.

Attack path: 1) Seller S is a beneficiary with totalAmount T=100, numOfSteps N=10, and has already claimed 5 steps (stepsClaimed=5, amountClaimed=50). 2) S lists 20 through Marketplace.listVesting, which calls VestingManager.listVesting, which calls StepVesting.transferVesting(S, manager, 20). S.totalAmount becomes 80 and releaseRate becomes 80/10=8, where the correct value is (80-50)/(10-5)=6. 3) At steps 6, 7, 8 and 9, S calls claim() and receives 8 each time, so amountClaimed reaches 82, which is above totalAmount=80. 4) At step 10 the catch-all branch computes totalAmount - amountClaimed = 80 - 82, which underflows. From then on claim() and available() revert for S, and any further transferVesting from S reverts. 5) The 2 tokens paid above S's totalAmount come from the StepVesting balance that is shared with the escrow entry, so the buyer who later buys the 20 listed tokens cannot receive all 20.

Impact: Loss of funds for other beneficiaries: the over-withdrawal reduces the pool that backs the escrowed listing, so the buyer or another later claimer is short. The grantor's own vesting also becomes unclaimable and cannot be listed or reallocated. The size of the overdraw grows with the listed amount and with the number of steps already claimed, and it happens on any ordinary partial listing by a seller who has claimed at least one step.

## [Medium] Referral reward is computed and emitted but never transferred to the referrer

File: SecondSwap_Marketplace.sol
Function: _handleTransfers()

_handleTransfers() computes referralFeeCost = buyerFeeTotal - (baseAmount * bfee * referralFee) / (BASE * BASE) and returns it. spotPurchase() then emits it as referralReward in Purchased. After the buyer pays, the only transfers are to listing.seller (baseAmount - sellerFeeTotal) and to feeCollector (buyerFeeTotal + sellerFeeTotal). No transfer goes to _referral, and Marketplace never reads referralFeeCollector from MarketplaceSetting. The formula also has its meaning inverted: referralFeeCost is the non-referral part of the buyer fee, not the referral part.

Attack path: A buyer calls spotPurchase(vestingPlan, listingId, amount, referrer) on a public listing (whitelist == address(0)) with referrer != msg.sender. The purchase succeeds and the Purchased event reports a referralReward greater than 0. The referrer's token balance does not change, and feeCollector receives the full buyerFeeTotal plus sellerFeeTotal.

Impact: The referral program pays nothing. Referrers lose their expected reward, the referral share of buyer fees silently goes to feeCollector, and the Purchased event misreports what was paid out.

## [Medium] Escrow entry stepsClaimed is set once and reused, so purchased vesting starts at a stale step

File: SecondSwap_VestingManager.sol
Function: completePurchase()

VestingManager keeps listed tokens in its own StepVesting entry (beneficiary = manager). _createVesting() copies stepsClaimed from the grantor only when that entry's totalAmount is zero, and later deposits into a non-empty entry keep the old stepsClaimed. completePurchase() and unlistVesting() then move tokens out through transferVesting(manager, buyer, amount), which passes the escrow entry's stale stepsClaimed to the new owner's vesting. The buyer's schedule therefore starts from an old step instead of the step the listed seller had reached.

Attack path: Seller A lists 40 while the escrow is empty, which fixes the escrow stepsClaimed at 0. Seller C, who has already claimed 4 of 10 steps and has 60 tokens available, lists 60 at step 9 while the escrow still holds A's tokens. Buyer B buys all 60 through spotPurchase, and completePurchase calls transferVesting(manager, B, 60). B's new entry gets stepsClaimed=0 and releaseRate=60/10=6, so B can claim 54 at step 9. C's own schedule for those 60 tokens would have given about 50 at that point.

Impact: Buyers and unlisted sellers receive a claimable amount that does not match the schedule the seller listed, so value shifts between the buyer and the seller depending on which listing happens to be bought. The total tokens stay conserved, so this is a timing and fairness error rather than a drain of the pool.

## [Medium] Steps greater than the vesting duration give stepDuration 0, so claimable() divides by zero and locks claims

File: SecondSwap_StepVesting.sol
Function: claimable()

The constructor sets stepDuration = (endTime - startTime) / numOfSteps. Nothing requires endTime - startTime >= numOfSteps, and VestingDeployer.deployVesting() only checks startTime < endTime and steps > 0. If the duration is shorter than the number of steps, stepDuration is 0. claimable() then computes elapsedTime / stepDuration once currentTime >= startTime and totalAmount != 0, which panics, and claim() calls claimable() first. stepDuration is immutable, so the plan stays broken.

Attack path: The token owner calls VestingDeployer.deployVesting(token, start, start + 100, 1000, id), so stepDuration = 100 / 1000 = 0. Beneficiaries are added with createVesting. After start, every claim() reverts for every beneficiary of that plan, and the locked tokens cannot be withdrawn. The token owner is a trusted role, so this is an input that the issuer can get wrong as well as something they could do on purpose.

Impact: All funds in the affected vesting plan become permanently unclaimable. Listing on the marketplace still works, so buyers can buy positions that can never be claimed.

## [Medium] Admin role is stored in three contracts; rotating the settings admin leaves VestingManager admin powers in place

File: SecondSwap_VestingManager.sol
Function: setMarketplace()

MarketplaceSetting.setS2Admin() changes only MarketplaceSetting.s2Admin. VestingManager has its own s2Admin, changed only by its setAdmin(), and it gates setMarketplace, setBuyerFee, setSellerFee, setVestingDeployer and setAdmin with that value. VestingDeployer has a third s2Admin that gates setManager and setAdmin. Marketplace.addCoin, unlistVesting admin path and setMarketplaceSettingAddress use the settings admin. The deploy script sets all three to the same address, and nothing keeps them in sync after that.

Attack path: The admin key is rotated through MarketplaceSetting.setS2Admin after a suspected compromise. The former key still satisfies the VestingManager onlyAdmin check. It calls VestingManager.setMarketplace(attackerContract). The attacker contract then calls completePurchase(attacker, plan, amount), which satisfies onlyMarketplace, and moves listed tokens out of the escrow entry into the attacker's vesting.

Impact: After a rotation the former admin keeps the ability to redirect the marketplace and move escrowed listed tokens. Separately, a settings-manager change that is not mirrored in VestingDeployer leaves new vestings pointing at an old manager, which blocks listVesting and transferVesting.

## [Medium] SecondSwap_Whitelist.whitelistAddress() lets anyone self-whitelist, so private sales are open to all

File: SecondSwap_Whitelist.sol
Function: whitelistAddress()

whitelistAddress() is external with no caller restriction. It only checks that totalWhitelist is below maxWhitelist and that userSettings[msg.sender] is false, then sets userSettings[msg.sender] = true and increments totalWhitelist. The only privileged role, lotOwner, can raise maxWhitelist through setMaxWhitelist() but has no function to add or remove addresses. Marketplace._validatePurchase() uses IWhitelist.validateAddress() as the only gate for private listings, so that gate is open to any address. WhitelistDeployer creates one whitelist per private listing with the seller as lotOwner.

Attack path: A seller creates a private listing with _isPrivate true and maxWhitelist N. Any address, for example a bot or a competitor, calls whitelistAddress() until totalWhitelist reaches N, then buys through spotPurchase(). Alternatively an attacker fills all slots before the intended buyers, so they are locked out.

Impact: The private-sale restriction does not hold: anyone can buy private-listing tokens on the private terms, and the seller's chosen buyers can be shut out by slot filling. No funds are stolen directly, but the access rule the seller relies on is missing.

## [High] transferVesting resets grantor releaseRate to total/numOfSteps, letting a partly claimed holder over-claim

File: SecondSwap_StepVesting.sol
Function: transferVesting()

transferVesting() reduces grantorVesting.totalAmount by _amount and then sets grantorVesting.releaseRate = totalAmount / numOfSteps. The formula used everywhere else, in _createVesting, is (totalAmount - amountClaimed) / (numOfSteps - stepsClaimed). The transferVesting line ignores amountClaimed and stepsClaimed, so after a partial transfer the grantor's per-step rate is too high once the grantor has already claimed some steps. claimable() pays releaseRate * claimableSteps on every intermediate claim, and caps the amount at the remaining balance only on the final step. Intermediate claims are not capped at totalAmount - amountClaimed, so the sum of claims can exceed the grantor's own allocation and draw on tokens held for other beneficiaries. The final claim then underflows in totalAmount - amountClaimed and reverts.

Attack path: A holder claims several steps of a StepVesting schedule. The holder then lists part of the unclaimed balance through Marketplace.listVesting, which calls VestingManager.listVesting, which calls transferVesting(seller, VestingManager, amount). That resets the holder's releaseRate to the wrong value. Worked example in words: total 100, 10 steps, 50 claimed after 5 steps, 20 listed, so 80 remain on the record and the rate becomes 8 instead of the correct 6. Claims on steps 6 to 9 then total 32 against 30 really remaining. The condition is that transferred amount X times (k+1) exceeds the pre-transfer total T, where k is the number of steps already claimed.

Impact: Unbacked claims are paid from the contract balance shared with all other vesting holders, so the pool becomes under-collateralized and the last beneficiaries cannot claim their full amounts. The holder's own final claim() and available() also revert because amountClaimed exceeds totalAmount. This is a loss for other beneficiaries and a denial of service on the holder's remaining claims.

## [Medium] Referral reward is computed in _handleTransfers but never paid to the referrer

File: SecondSwap_Marketplace.sol
Function: _handleTransfers()

When _referral is non-zero and the listing is not private, _handleTransfers() computes referralFeeCost = buyerFeeTotal - (baseAmount * bfee * referralFee) / (BASE * BASE). No transfer in the function sends this amount, or any share of it, to _referral. The final transfer sends the full buyerFeeTotal + sellerFeeTotal to feeCollector, so the referral share never moves. MarketplaceSetting declares referralFeeCollector, but nothing in the repo sets or uses it. The Purchased event reports referralFeeCost as referralReward, which implies a payment that never happened. The code does not show which split was intended, but in every reading no transfer to the referrer exists.

Attack path: A buyer calls spotPurchase() with a non-zero _referral on a public listing. The buyer pays baseAmount + buyerFee, the seller receives baseAmount - sellerFee, and feeCollector receives all fees. The referrer receives nothing, and this repeats for every purchase.

Impact: Referral rewards that the protocol advertises are never paid. The whole fee goes to the collector and the event shows a reward that never moved, which misleads referrers and users about the economics.

## [Medium] Pooled VestingManager balance and existing-holder branch drop the seller's claim progress, so bought tokens vest from the wrong step

File: SecondSwap_StepVesting.sol
Function: _createVesting()

_createVesting() sets stepsClaimed only when the beneficiary's totalAmount is 0. For an internal transfer into an existing record the receiver's stepsClaimed is kept, and the new amount is folded into one releaseRate over (numOfSteps - receiver.stepsClaimed). Tokens moved by transferVesting therefore take the receiver's or the pool's step counter, not the grantor's. VestingManager collects listed tokens from many sellers into one record, whose stepsClaimed is fixed by whichever seller deposited first while the pool was non-empty. completePurchase() then passes that pooled stepsClaimed to the buyer through transferVesting. A seller who has claimed up to step k therefore lists tokens whose buyer schedule starts at the pool's step, not at k.

Attack path: Seller A, with no steps claimed, lists 100 tokens at step 0, so VestingManager gets stepsClaimed 0. At step 10 of 20, seller B, who has claimed through step 10, lists 100 more, and the pool stays at stepsClaimed 0. At step 11 a buyer purchases seller B's listing. The buyer's new record gets stepsClaimed 0 and releaseRate 100 / 20, so 55 tokens are claimable at step 11, where the schedule gives 10. The reverse order cuts the buyer's entitlement. A buyer who already holds an unclaimed record of the same plan gets the same effect, because _createVesting keeps the existing stepsClaimed.

Impact: Purchased tokens unlock earlier than the schedule the seller had, or later than the schedule the buyer paid for, depending on the order of listings. The contract stays solvent because each claim is capped by the holder's own total, so the harm is schedule violation and mispricing, not a pool drain.

## [Medium] Token issuer can move any holder's unclaimed vesting through VestingDeployer.transferVesting without holder consent

File: SecondSwap_VestingDeployer.sol
Function: transferVesting()

transferVesting() accepts any _grantor and _beneficiary and checks only that msg.sender is the token owner of the StepVesting's token. It forwards to SecondSwap_StepVesting.transferVesting, which accepts calls from tokenIssuer, manager or vestingDeployer and checks only that the grantor has enough unclaimed balance. Nothing ties the move to the grantor's consent or to a marketplace sale. The inline comment labels this as the 3.2 arbitrary-transfer item, so the team was aware, but the code still lets the issuer move unclaimed vesting from any holder.

Attack path: The token owner of a token deploys a vesting plan, then calls VestingDeployer.transferVesting with an arbitrary holder as _grantor and the owner's own address as _beneficiary for that holder's unclaimed balance. The holder's future vesting moves to the owner.

Impact: Holders' unclaimed tokens can be taken by the issuer without consent, a rug-pull vector. Whether this is intended depends on a trust model that is not documented in scope.

## [Medium] Public initialize() without _disableInitializers on Marketplace, VestingManager and VestingDeployer can be front-run

File: SecondSwap_VestingManager.sol
Function: initialize()

VestingManager.initialize(), VestingDeployer.initialize() and Marketplace.initialize() are public and rely only on the OpenZeppelin initializer modifier. None of these contracts calls _disableInitializers() in a constructor, so a bare implementation deployment can still be initialized by anyone. The repo has no deployment script or proxy, so it cannot be verified that the first initialize() is atomic with deployment. If it is not, the caller of initialize() becomes s2Admin on VestingManager, which controls setMarketplace, setBuyerFee and setAdmin, and s2Admin on VestingDeployer, which controls setTokenOwner and setManager.

Attack path: The project deploys a proxy or implementation in one transaction and calls initialize() in a later one. An attacker sees the deployment and calls initialize(attacker) first. On VestingDeployer the attacker then calls setTokenOwner(token, attacker) and uses transferVesting or createVesting on any plan for that token.

Impact: Full admin takeover of the marketplace configuration, or control of vesting for any token mapped to the attacker on the deployer, if the deployment was not atomic.

## [Medium] A vesting with fewer seconds than steps gets stepDuration 0, and every claim() divides by zero

File: SecondSwap_StepVesting.sol
Function: claimable()

The StepVesting constructor sets stepDuration = (_endTime - _startTime) / _numOfSteps with integer division. VestingDeployer.deployVesting checks only startTime < endTime and steps > 0, so a duration shorter than the step count yields stepDuration 0. claimable() computes elapsedTime / stepDuration once block.timestamp is at or after startTime and the holder's totalAmount is non-zero, so it reverts for every such holder. Every claim() on that vesting then reverts, and no other exit path exists for those tokens.

Attack path: The token owner deploys a vesting with startTime and endTime a few seconds apart and 10 steps. After startTime, every holder calling claim() reverts and the tokens stay locked.

Impact: All tokens in that vesting are unclaimable for all holders, from one issuer misconfiguration. Whether issuer misconfiguration is in scope depends on the trust model.

## [High] transferVesting recomputes releaseRate from totalAmount/numOfSteps, ignoring claimed amount and steps

File: SecondSwap_StepVesting.sol
Function: transferVesting()

transferVesting() subtracts _amount from grantorVesting.totalAmount and then sets grantorVesting.releaseRate = totalAmount / numOfSteps. The correct per-step rate for the grantor's remaining schedule is (totalAmount - amountClaimed) / (numOfSteps - stepsClaimed), which _createVesting() already uses correctly for existing entries. The transfer path ignores both amountClaimed and stepsClaimed, so the grantor's rate is inflated by a factor numOfSteps / (numOfSteps - stepsClaimed). claimable() pays releaseRate * claimableSteps at every intermediate step and only caps the payout at totalAmount - amountClaimed when stepsClaimed + claimableSteps reaches numOfSteps. The marketplace listing flow calls this same function through VestingManager.listVesting() with the seller as grantor, so any seller with a partially claimed schedule triggers the inflated rate.

Attack path: 1) Seller A holds a 1000-token schedule with 10 steps and claims at step 5, so amountClaimed is 500 and stepsClaimed is 5. 2) A lists 400 tokens on the marketplace. VestingManager calls transferVesting(A, manager, 400), so A's totalAmount becomes 600 and releaseRate becomes 60, while the correct rate is 100/5 = 20. 3) At step 9, A calls claim(). claimableSteps is 4 and the payout is 60 * 4 = 240, but only 100 is left for A (600 - 500). 4) A's amountClaimed becomes 740, above totalAmount 600, and the 140 excess comes out of the same contract balance that backs the 400 listed tokens. The escrow becomes undercollateralized, so later buyer claims or the last claim revert.

Impact: Other beneficiaries' tokens are paid out to a seller who has already claimed part of its schedule. The contract becomes insolvent by up to the full over-claim, and later claimers, including buyers of listed tokens, can be left unable to withdraw. Any holder with a partial claim can trigger it through the normal listing flow without admin cooperation.

## [Medium] Seller can buy back its own listing to raise sellLimit and exceed maxSellPercent

File: SecondSwap_VestingManager.sol
Function: listVesting()

listVesting() computes sellLimit as allocations.bought plus maxSellPercent of the holder's original allocation (currentAlloc + sold - bought). completePurchase() increments bought for the address that buys, and bought is counted into sellLimit without limit. Marketplace._validatePurchase() and spotPurchase() do not reject msg.sender == listing.seller, so a seller can buy its own listing. That raises bought by the purchased amount and raises sellLimit by the same amount, while total returns to its original size. The round trip costs only buyerFee and sellerFee, which are 2.5 percent each by default.

Attack path: 1) Holder with a 1000-token allocation and maxSellPercent 2000 lists 200. The cap is 200 * 1 = 200 and sold is 200. 2) The holder calls spotPurchase on its own listing for 200 and pays the fees. completePurchase sets bought to 200 and total returns to 1000. 3) The cap is now bought 200 plus 20 percent of (1000 + 200 - 200) = 400, so the holder lists another 200. 4) Repeating the buy-back and relist cycle, paying fees each time, lets the holder list its whole allocation.

Impact: The issuer's anti-dump limit on how much of an original allocation can be sold is bypassed. A holder can sell its full vesting position on the marketplace for the cost of trading fees, against the intended 20 percent cap.

## [High] Whitelist lets any address self-register, so private listings are not private

File: SecondSwap_Whitelist.sol
Function: whitelistAddress()

whitelistAddress() adds msg.sender to userSettings and increments totalWhitelist. The only checks are the capacity limit and that the caller is not already listed; there is no caller authorization. lotOwner is set in the constructor and can only call setMaxWhitelist(), which raises capacity. The contract has no function that lets lotOwner add or remove addresses. Marketplace._validatePurchase() gates private listings only through IWhitelist.validateAddress(msg.sender), which reads userSettings, so the gate is first-come registration open to every address.

Attack path: 1) Seller creates a private listing with _isPrivate true and _maxWhitelist N through Marketplace.listVesting(). WhitelistDeployer deploys a SecondSwap_Whitelist with the seller as lotOwner. 2) An uninvited user calls whitelistAddress() before the intended buyers do, and validateAddress returns true for that user. 3) The uninvited user calls spotPurchase and buys from the private lot. 4) A bot can fill all N slots, so intended buyers get 'Reached whitelist limit' and cannot register at all.

Impact: Private allocations, including any lockup or investor-only terms the seller set, are sold to addresses the seller never approved. Legitimate invitees can be shut out by bots that exhaust the capacity first.

## [Medium] Escrow stepsClaimed is anchored to the first lister, so listed and bought tokens unlock early

File: SecondSwap_StepVesting.sol
Function: _createVesting()

_createVesting() takes _stepsClaimed from the sender of the transfer, but it uses that value only when the receiver's totalAmount is 0. When the receiver already has an entry, incoming tokens are merged into it and the receiver's own stepsClaimed is kept, so the incoming tokens start vesting from the receiver's step, not the source's. The marketplace escrow (the VestingManager address) is one shared entry, and its stepsClaimed is set when the first seller lists into an empty escrow. Every later listing merges into that entry, and every purchase creates a buyer entry with stepsClaimed copied from the escrow. The vesting schedule of the tokens sold therefore depends on listing order, not on the seller's remaining schedule.

Attack path: 1) Seller A with stepsClaimed 0 lists 100 tokens into an empty escrow, so the escrow gets stepsClaimed 0. 2) Seller B, who has already claimed 8 of 10 steps, lists 200 tokens. The escrow merges them and keeps stepsClaimed 0, so its releaseRate becomes 300 / 10. 3) Buyer C buys 200 through spotPurchase. completePurchase calls transferVesting(manager, C, 200), and C's new entry gets stepsClaimed 0 and releaseRate 200 / 10. 4) At step 8, C can claim 20 * 8 = 160 right away. B's 200 tokens had only 2 steps left and would have had nothing claimable at step 8.

Impact: Secondary-market buyers can unlock listed tokens before the issuer's schedule allows, so the lockup is bypassed. The size of the bypass depends on the order of listings, and the same anchoring applies when tokens are returned through unlistVesting into a seller's entry.

## [Medium] Old VestingManager admin keeps control after settings admin rotation, enabling escrow drain

File: SecondSwap_MarketplaceSetting.sol
Function: setS2Admin()

MarketplaceSetting keeps its own s2Admin, changed by setS2Admin(). VestingManager keeps a separate s2Admin, changed only by its own setAdmin(), and it gates setMarketplace(), setAdmin(), setBuyerFee(), setSellerFee() and setVestingDeployer() with onlyAdmin. Rotating the settings admin does not change VestingManager's admin, so the previous key keeps full VestingManager control. setMarketplace() has no timelock and no validation, and completePurchase() and unlistVesting() are onlyMarketplace, so whoever is set as marketplace can move escrow tokens.

Attack path: 1) The settings admin is rotated to a new key because the old key is suspected compromised. VestingManager.s2Admin still holds the old key. 2) The old key calls VestingManager.setMarketplace(attackerContract). 3) attackerContract calls completePurchase(attackerEOA, plan, escrowBalance), which sets attackerEOA's bought and calls transferVesting(manager, attackerEOA, escrowBalance). The escrow entry has enough balance, so the transfer succeeds. 4) attackerEOA claims the escrowed tokens over the remaining schedule.

Impact: All tokens currently listed on the marketplace can be moved to an attacker. The rotation the team expects to remove the old key's access does not do so for VestingManager.
