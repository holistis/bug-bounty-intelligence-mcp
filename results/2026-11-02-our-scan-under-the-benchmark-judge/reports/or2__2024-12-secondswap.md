# Audit report

## [High] transferVesting resets grantor releaseRate to totalAmount/numOfSteps, ignoring claimed steps, allowing over-claim

File: SecondSwap_StepVesting.sol
Function: transferVesting()

After deducting _amount, transferVesting sets grantorVesting.releaseRate = totalAmount / numOfSteps. It ignores amountClaimed and stepsClaimed. The correct rate is (totalAmount - amountClaimed) / (numOfSteps - stepsClaimed). Whenever the grantor has already claimed some steps, the new rate is too high. claimable() returns releaseRate * claimableSteps whenever the final step has not been reached, and it has no cap at totalAmount - amountClaimed. The grantor can therefore claim more than totalAmount before the last step. Example: total 1000, 10 steps, 5 steps claimed (500 claimed), 200 listed. The new total is 800 and the rate is 80, against a correct rate of 60. Claiming steps 6 to 9 pays 320 against 300 owed, so amountClaimed exceeds totalAmount.

Attack path: 1. A holder with a vesting entry waits until some steps have vested and calls claim(). 2. The holder lists up to maxSellPercent via Marketplace.listVesting, which calls VestingManager.listVesting, which calls transferVesting(seller, manager, amount). 3. The seller's releaseRate is now inflated. 4. The seller claims at later steps and pulls more tokens than their remaining entitlement. The excess is paid out of tokens that belong to other beneficiaries. 5. The last claim, and available(), then underflow and revert.

Impact: Theft of other beneficiaries' tokens held by the vesting contract. The last claimers cannot claim in full, and the seller's own entry becomes inconsistent (amountClaimed > totalAmount).

## [Medium] Referral reward is computed and emitted but never paid; all fees go to feeCollector

File: SecondSwap_Marketplace.sol
Function: _handleTransfers()

_handleTransfers computes referralFeeCost but never transfers it to _referral or to a referral collector. The full buyerFeeTotal + sellerFeeTotal is sent to feeCollector. The formula is also odd: it is buyerFeeTotal minus the referral share, so it is the complement of the intended reward. The Purchased event reports a referralReward that no one receives.

Attack path: A buyer calls spotPurchase with a referral address on a non-private listing. The referral expects a reward, but only the fee collector gets paid.

Impact: The referral feature does not work. The event and accounting data report rewards that were never paid, and buyers or referrers are misled.

## [Medium] Whitelist for private listings is permissionless, so any address can self-whitelist or fill all slots

File: SecondSwap_Whitelist.sol
Function: whitelistAddress()

whitelistAddress() has no restriction on msg.sender. Any address can add itself until totalWhitelist reaches maxWhitelist. The lotOwner cannot add or approve specific buyers or remove anyone. A private listing is therefore open to the first maxWhitelist callers, not to buyers the seller chose.

Attack path: 1. A seller creates a private listing with maxWhitelist = N. 2. An attacker, or many Sybil addresses, call whitelistAddress() until the limit is reached. 3. The intended buyers cannot be whitelisted and cannot buy. Alternatively the attacker whitelists itself and buys the discounted private listing.

Impact: Private or discounted sales can be captured by arbitrary parties, or the intended buyers can be locked out. Gas costs are minimal.

## [Medium] Vesting pooled in the manager's single entry carries the first lister's stepsClaimed to every buyer

File: SecondSwap_StepVesting.sol
Function: transferVesting() / _createVesting()

All listed vesting from all sellers is held in one entry for the VestingManager address. That entry's stepsClaimed is set only when the entry is created (totalAmount == 0), from the first seller's stepsClaimed. Later sellers' tokens are added to it without changing stepsClaimed. completePurchase then calls transferVesting(manager, buyer), and a new buyer inherits the manager entry's stepsClaimed, not the stepsClaimed of the tokens' original seller. A buyer can receive a schedule that is too slow or too fast, depending on who listed first. A seller with a high stepsClaimed can deliberately create the pool entry with a high value.

Attack path: 1. An attacker holding a vesting entry with high stepsClaimed lists first while the pool is empty. 2. The pool entry gets stepsClaimed = k, with rate = amount / (n - k). 3. Later buyers of other sellers' listings who have no existing vesting entry inherit stepsClaimed = k and cannot claim the earlier steps until the end. The reverse case lets a buyer claim earlier than the original schedule allows.

Impact: Buyers receive a vesting schedule different from the tokens they paid for (delayed unlock, or mis-timed unlock). Unlock timing becomes manipulable.

## [Medium] stepsClaimed can exceed numOfSteps, then numOfSteps - stepsClaimed underflows or divides by zero in _createVesting

File: SecondSwap_StepVesting.sol
Function: claimable() / _createVesting()

claimable() computes currentStep = elapsed / stepDuration, where stepDuration = floor((end - start) / numOfSteps). When the duration is not divisible by the step count, currentStep at or after endTime can exceed numOfSteps. claim() stores this as stepsClaimed, so stepsClaimed can be greater than numOfSteps. _createVesting then evaluates numOfSteps - stepsClaimed, which reverts on underflow. A beneficiary with stepsClaimed == numOfSteps who becomes the first entry in an empty pool gets a division by zero in the new-entry branch. In both cases, adding tokens to that account fails. Separately, stepDuration can be 0 when the duration is shorter than the step count, which makes claimable() divide by zero and blocks all claims. deployVesting does not check for this.

Attack path: 1. A holder claims after endTime on a plan whose duration does not divide evenly by the step count. 2. stepsClaimed becomes greater than numOfSteps. 3. A later unlist of their listing, or a purchase of tokens by this account, reverts in _createVesting.

Impact: Unlist, purchase and listing flows can revert for affected accounts, and tokens can be stuck in the pool. Plans with a zero stepDuration cannot be claimed at all.

## [Medium] Changing the vestingManager in MarketplaceSetting strands existing listings

File: SecondSwap_MarketplaceSetting.sol
Function: setManager()

Listed vesting is held in the old manager's vesting entry, and the old manager's allocations record sold/bought. Marketplace looks up vestingManager from the settings on every call. After setManager switches to a new manager, unlistVesting and spotPurchase call newManager.unlistVesting/completePurchase. The new manager has no pooled entry and no allocations. allocations.sold -= amount underflows and transferVesting(newManager, ...) reverts with insufficient balance. Also, each StepVesting stores its own immutable-in-practice manager, so the new manager is not authorized on existing plans.

Attack path: 1. Admin calls setManager(newManager) while listings are active. 2. Buyers and sellers of existing listings can no longer complete purchases or unlist.

Impact: The sellers' listed vesting is locked in the old manager's entry and the buyers' payment flow reverts.

## [Medium] maxSellPercent limit can be bypassed with self-purchases from sybil accounts

File: SecondSwap_VestingManager.sol
Function: listVesting()

The sell limit is bought + maxSellPercent * (current + sold - bought) / BASE. Tokens an account bought are allowed to be resold in full. An original holder can sell their allowed share to their own second address through the marketplace. That second address has bought == amount and can relist 100% of it. Repeating this with a chain of addresses lets the holder sell the whole allocation, despite the percent cap.

Attack path: 1. The holder lists 20% and buys it back from a second account (paying only fees). 2. The second account lists everything it bought and sells it to a third account or to the market. 3. Repeat.

Impact: The cap that the token issuer relies on to limit secondary selling of vesting allocations is ineffective.
