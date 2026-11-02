# Audit report

## [High] setLoans() has no access control: anyone can rewire loans/NFT and wipe the NAV list

File: PortfolioVault.sol
Function: setLoans()

`setLoans(address,address)` is `external` and its only guard is `_requireIdleNav()`, so any address can call it. The only other checks are `_validateLoansWiring`, which reads `currency()` and `LOANS_CONTRACT()` from the supplied addresses. An attacker can pass contracts they control that return the right values. The function then runs `_clearNavLoanIds()`, which empties the whole curated NAV list. It then overwrites `loans` and `loansNFT` and invalidates the NAV. Every other config setter (`setCalculator`, `setExchange`, `setMaxNavAge`) has a role check; this one does not, which looks like a missing modifier.

Attack path: 1) Attacker deploys a fake Loans contract whose `currency()` returns the asset, plus a fake NFT whose `LOANS_CONTRACT()` returns the fake Loans. 2) Any time no NAV cycle is in progress, attacker calls `setLoans(fake, fakeNFT)`. 3) The vault forgets all real loans, and its NAV now excludes them. `loans` points at attacker code. 4) A later `fundLoans` or `fundLoan` does `forceApprove(loans, total)` and calls `loans.fund` on the attacker contract, which can pull the approved USDC. `registerAddress` and `collectCashflows` also call the fake contract. 5) The next `updateNav` computes a NAV far below the real value, so redemptions and deposits are priced against it.

Impact: Anyone can take over the vault's external wiring, drop the real loan book out of NAV and distort share pricing. Funds can be drained through approvals to a malicious Loans contract. Real loan NFTs are left stranded outside accounting. The vault is effectively unprotected.

## [High] setMaxNavComputationTime() is callable by anyone, letting an attacker DoS NAV updates

File: PortfolioVault.sol
Function: setMaxNavComputationTime()

`setMaxNavComputationTime` has no role check, only `_maxNavComputationTime > 0`. `updateNav` restarts the computation (`navCursor = 0; pendingNav = 0`) whenever `block.timestamp - navStart > maxNavComputationTime`. Any caller can set the value to 1. Any NAV that needs more than one batch, or more than one block or transaction, then restarts every time and can never finalise. `navStart` stays non-zero, so `_requireFreshNav` and `_requireIdleNav` keep reverting.

Attack path: 1) Attacker calls `setMaxNavComputationTime(1)`. 2) The manager starts a multi-batch `updateNav`. 3) The attacker repeats the call, or relies on the 1-second window. 4) Each subsequent `updateNav` call sees the timeout and restarts at cursor 0. 5) `lastNav` never refreshes, `approveDeposit` and `approveRedemption` revert with StaleNav, and the other functions guarded by `_requireIdleNav` stay blocked. The attacker can also set an enormous value to disable the intended timeout guard.

Impact: Permissionless denial of service on NAV finalisation, and so on all deposit and redemption approvals. `fundLoans`, `acceptSaleOffer`, `transferLoans`, `collectCashflows` and the NAV-list changes are also blocked while a cycle is stuck in progress. The only recovery is for a privileged user to reset the value, and the attacker can undo it.

## [Medium] approveRedemption can burn shares for zero assets, leaving them unredeemable

File: PortfolioVault.sol
Function: approveRedemption()

A comment above the liquidity check says it 'prevents approving a tiny amount that rounds to 0 assets', but no `require(assets > 0)` follows it. `assets = shares * lastNav / totalSupply` can round to 0 for small share amounts, because shares have 18 decimals and the asset typically has 6. The function still moves `shares` from pending to `claimableRedeemShares` and burns them from the vault. `redeem` and `withdraw` then require `claimableAssets_ > 0` and `assets > 0`, so shares recorded against 0 assets can never be claimed.

Attack path: 1) A controller requests a redeem of a small number of shares, or a manager approves a small slice. 2) With `shares * lastNav < totalSupply`, assets = 0 and the check `0 <= idleLiquidity()` passes. 3) The shares are burned and moved to `claimableRedeemShares`. 4) `redeem` reverts at `claimableAssets_ > 0` or at `assets > 0` in `_claimRedeem`. 5) The shares cannot be cancelled either, because they are no longer pending.

Impact: The controller permanently loses the shares, and the other holders gain slightly from the burn. The size is bounded by rounding dust, but it breaks the stated invariant.

## [Medium] setLoans does not re-validate the exchange or reset NFT-related state for the new pair

File: PortfolioVault.sol
Function: setLoans()

After `setLoans` replaces `loans` and `loansNFT`, the `exchange` reference is not re-checked. `setExchange` requires `exchange.LOANS() == loans` and `exchange.LOANS_NFT() == loansNFT`, but `setLoans` never re-establishes that. `createSaleOffer`, `acceptSaleOffer` and `cancelSaleOffer` therefore keep operating on an exchange tied to the old pair. `acceptSaleOffer` then adds the old collection's loan IDs to the NAV list while checking ownership against the new `loansNFT`. Allowances the vault granted to the old loans contract (`forceApprove` residuals) are also not revoked.

Attack path: 1) A privileged caller, or anyone, since `setLoans` is open, switches the loans pair. 2) The exchange still points at the old collection. 3) `acceptSaleOffer` pays real USDC to the old exchange while `ownerOf` is checked on the new NFT contract. The call reverts or admits the wrong IDs, and the vault's accounting no longer reflects what it holds.

Impact: Inconsistent state across contracts after a re-wire. Possible stuck sale flows, or NAV that includes wrong IDs. Stale allowances stay in place to the old Loans contract.

## [Medium] Anyone holding a loan NFT can grief NAV cycles and approvals by sending it to the vault

File: PortfolioVault.sol
Function: updateNav() / _requireFreshNav()

The vault's freshness check ties `lastOwnershipNonce` to `loansNFT.ownershipNonce(address(this))`. The code comments say any out-of-band NFT transfer to the vault, including a donation, bumps that nonce. `onERC721Received` only guards `safeTransferFrom`, so a plain `transferFrom` of a loan NFT to the vault is not blocked. In `updateNav`, a nonce change mid-cycle resets `navCursor` and `pendingNav`. After finalisation, a nonce change makes `_requireFreshNav` revert with `PortfolioHoldingsChanged`. The vault has no way to refuse or return an unsolicited NFT except `transferLoans`, which only a manager can call.

Attack path: 1. The attacker holds loan NFTs. 2. After the manager finalises `updateNav`, or between batches of a multi-batch cycle, the attacker transfers an NFT to the vault. 3. All `approveDeposit` and `approveRedemption` calls revert, or the in-progress cycle restarts from cursor 0. 4. The attacker repeats this in front of every `updateNav` or approval transaction.

Impact: Investor deposit and redemption approvals can be delayed indefinitely. A cycle that needs several batches can be prevented from finishing. The cost to the attacker is one NFT per bump, and it depends on how freely loan NFTs can be obtained.

## [Medium] setExchange swaps the exchange while open offers and NFT approvals remain on the old exchange

File: PortfolioVault.sol
Function: setExchange() / cancelSaleOffer()

`createSaleOffer` approves each loan NFT to the current `exchange` and creates the offer there. `setExchange` only validates the new exchange and overwrites the `exchange` pointer. `cancelSaleOffer` and `acceptSaleOffer` always use the current `exchange`, so offers on the old exchange can no longer be cancelled through the vault. The per-token approvals to the old exchange also remain. A buyer can still settle those offers at their original, possibly stale, price. The NFT leaves the vault without any manager action.

Attack path: 1. A manager creates a sale offer on exchange A. 2. The guardian calls `setExchange(B)`. 3. The manager cannot cancel the offer on A through the vault. 4. The named buyer, or anyone if the buyer is address(0), accepts the offer on A at the old price.

Impact: The vault can lose loans at a price that no longer reflects their value, and the manager cannot prevent it.

## [Medium] First deposit cannot be approved on an empty vault because lastNav is zero

File: PortfolioVault.sol
Function: updateNav() / approveDeposit()

`updateNav` computes `lastNav` as balance plus loan value minus `totalPendingDepositAssets` minus `totalClaimableRedeemAssets`. On a fresh vault with only pending deposits, `lastNav` is 0. `_requireFreshNav` requires `lastNav > 0` and reverts with `ZeroNav`. `approveDeposit` therefore can never approve the first deposit unless someone donates assets or funds loans from other money. If a tiny donation is used to unlock it, `shares = assets * totalSupply / lastNav` is priced against the 1e18 dead shares and the arbitrary seed value. The first investors then get a share count and price that depend only on that arbitrary seed.

Attack path: 1. The vault is deployed with only the dead shares. 2. Investors call `requestDeposit`. 3. The manager runs `updateNav`, which gives `lastNav` = 0. 4. `approveDeposit` reverts with `ZeroNav`. 5. A donor sends 1 wei of the asset, `lastNav` becomes 1, and the first deposit is approved at an extreme share ratio.

Impact: Launch is blocked until a donation is made. The initial share price is set by a manipulable seed instead of a defined starting price.

## [Medium] fundLoans adds loans to NAV without verifying vault ownership, and leaves residual allowances

File: PortfolioVault.sol
Function: _fundLoans()

`_fundLoans` calls `_addLoanToNav(loanId)` after `loans.fund`, without checking `loansNFT.ownerOf(loanId) == address(this)`. By contrast, `addLoansToNav` and `acceptSaleOffer` both check this. The vault also does `assetToken.forceApprove(address(loans), totalAmount)` and never resets it to 0. If `fund` pulls less than `totalAmount` (for example because of a per-loan cap or a skipped transfer), the remaining allowance persists on the Loans contract. A funded loan that the vault does not own is only dropped at the next `updateNav` sweep.

Attack path: 1) The manager funds a loan ID the vault does not hold, or the Loans contract takes less than approved. 2) The ID enters `_navLoanIds`, and the allowance stays non-zero. 3) The next `updateNav` has to heal the list, and the allowance stays available to the Loans contract.

Impact: Short-lived list inconsistency and leftover token allowances. The impact is limited by the trusted manager and the Loans contract. This is a hardening gap, not a direct theft.

## [Medium] createSaleOffer approvals are not revoked on cancel, and offers can be created mid-NAV-cycle

File: PortfolioVault.sol
Function: createSaleOffer()/cancelSaleOffer()

`createSaleOffer` calls `loansNFT.approve(exchange, loanId)` for each loan, and `cancelSaleOffer` only calls `exchange.cancelOffer` without clearing those approvals. The approval to the exchange therefore persists after cancel, and also after `setExchange` swaps the exchange (the old exchange keeps the approval). The functions do not require an idle NAV. If the exchange has any code path that moves approved NFTs outside a valid offer, those loans can leave the vault without the manager intending it. Any such transfer would still be detected by the ownership nonce.

Attack path: 1) The manager creates an offer, then cancels it or replaces the exchange. 2) The NFT approval to the old or cancelled exchange remains. 3) A bug or malicious exchange logic moves the NFT out.

Impact: Residual approvals on valuable NFTs. This is conditional on exchange behaviour that is not in scope, so I treat it as low-probability.

## [Medium] deposit(), mint() and cancelRedeemRequest() do not require the receiver to be a verified investor

File: PortfolioVault.sol
Function: deposit()/mint()/cancelRedeemRequest()

`redeem`, `withdraw` and `cancelDepositRequest` call `_requireInvestor(receiver)`. `deposit(assets,receiver,controller)` and `mint(shares,receiver,controller)` through `_claimDeposit` only require `receiver != address(this)`. `cancelRedeemRequest` only requires `receiver != address(this)`. The vault's only investor check on these paths is on the controller. The receiver is chosen by the controller or by an operator. The vault therefore relies entirely on the share token to enforce SHAREHOLDER_ROLE on transfers.

Attack path: 1. A controller or an approved operator calls `deposit` or `cancelRedeemRequest` with a receiver that is not a shareholder. 2. If the share token does not restrict transfers by recipient role, shares reach a non-verified address.

Impact: The investor-whitelist invariant that the vault applies elsewhere can be bypassed if the share token does not enforce it.
