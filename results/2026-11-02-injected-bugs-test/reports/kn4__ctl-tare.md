# Audit report

## [Medium] Anyone holding a loan NFT can donate it to the vault to reset NAV cycles and block approvals

File: PortfolioVault.sol
Function: updateNav()/_requireFreshNav()

NAV freshness depends on `loansNFT.ownershipNonce(address(this))`. `updateNav` restarts the cycle (navCursor=0, pendingNav=0) whenever the nonce differs from `lastOwnershipNonce`. `approveDeposit` and `approveRedemption` revert with `PortfolioHoldingsChanged` on the same mismatch. `onERC721Received` only checks `msg.sender == loansNFT`, and plain `transferFrom` needs no receiver hook, so any holder of a loan NFT can send one to the vault. The vault has no way to refuse or filter incoming NFTs.

Attack path: 1. The manager starts a multi-batch `updateNav`, or finalises one and is about to call `approveDeposit` or `approveRedemption`. 2. The attacker transfers a loan NFT to the vault, which bumps the nonce. 3. The next `updateNav` batch restarts from zero, or the approval reverts with `PortfolioHoldingsChanged`. 4. The attacker repeats this whenever the manager makes progress.

Impact: Investor approvals can be delayed indefinitely, or NAV computation can be starved on large portfolios. Cost to the attacker is only the NFT transfer. This depends on how cheaply an attacker can obtain loan NFTs, which I could not check.

## [Medium] setExchange swaps exchange while offers and NFT approvals remain live on the old exchange

File: PortfolioVault.sol
Function: setExchange()

createSaleOffer() calls IERC721.approve(exchange, loanId) for each loan and creates the offer on the current exchange. setExchange() only checks _requireIdleNav() and that the new exchange's LOANS, LOANS_NFT and CURRENCY match. It does not check or cancel open offers on the old exchange, and it does not clear the per-token approvals given to it. cancelSaleOffer() and acceptSaleOffer() only talk to the new `exchange`, so the vault can no longer cancel stale offers. The old exchange keeps both the offer and the NFT approval, so any buyer can still settle at the old price.

Attack path: 1) The portfolio manager creates a sale offer for loans L at a low price P on exchange A. 2) The guardian calls setExchange(B) before the offer is cancelled or filled. 3) The vault can no longer cancel the offer, because cancelSaleOffer() calls B. 4) The named buyer (or anyone, if the offer is open) calls A.acceptOffer and takes the loans at the stale price P, because A still holds the NFT approval.

Impact: Loans can be sold at a stale or unwanted price and the vault has no on-chain way to cancel. The sale bumps the ownership nonce, so NAV has to be refreshed, but the value loss to the vault's investors has already happened.

## [Medium] Vault cannot bootstrap: deposits cannot be approved while lastNav is zero

File: PortfolioVault.sol
Function: approveDeposit()/_requireFreshNav()

`lastNav` is computed as the asset balance, plus the adjusted loan value, minus `totalPendingDepositAssets`, minus `totalClaimableRedeemAssets`. A new vault with no loans and only pending deposits therefore has NAV 0. `_requireFreshNav` requires `lastNav > 0` and reverts with `ZeroNav`. `approveDeposit` always calls `_requireFreshNav`. The 1e18 dead shares exist, so supply is nonzero, but there is no way to price the first deposit.

Attack path: 1. Deploy the vault. 2. Investors call `requestDeposit`. 3. The manager runs `updateNav`, which gives lastNav == 0. 4. `approveDeposit` reverts with `ZeroNav`. 5. The only way out is an out-of-band transfer of assets or loans into the vault.

Impact: The vault cannot take its first deposits without a manual donation, and that donation accrues to the dead shares. NAV can also fall back to zero after all value is withdrawn, which blocks deposits again.

## [Medium] setLoans drops curated NAV and strands old-collection NFTs and loan positions with no check

File: PortfolioVault.sol
Function: setLoans()

setLoans() calls _clearNavLoanIds(), then overwrites `loans` and `loansNFT`. It never checks that the vault holds no NFTs of the old collection, or that no funded or outstanding positions remain in the old Loans contract. All later paths (transferLoans, createSaleOffer, collectCashflows, addLoansToNav, updateNav) use the new `loansNFT` and `loans`. Old NFTs therefore cannot be transferred out, sold or collected from through the vault, and they are no longer valued, so lastNav falls to roughly cash only. The loop in _clearNavLoanIds() is also unbounded (one pop and one event per id), so a large list can make setLoans uncallable because of gas.

Attack path: 1) The vault holds many loans in NAV under Loans/LoansNFT v1. 2) The guardian migrates with setLoans(v2) without first moving the loans out. 3) The old NFTs and any cash owed by v1 are stuck, and the next updateNav gives a NAV that excludes them. 4) Approvals at that NAV are then mispriced (cheap deposits, redemptions paid out against missing assets). Alternatively, with a very large list, setLoans() runs out of gas and cannot be used.

Impact: Investor funds invested in the old Loans deployment can be locked, and share pricing is wrong after the switch. The migration call can also be bricked by gas.

## [Medium] setLoans does not revalidate or reset the exchange for the new Loans/LoansNFT pair

File: PortfolioVault.sol
Function: setLoans()

`setExchange` requires `exchange.LOANS() == loans` and `exchange.LOANS_NFT() == loansNFT`. `setLoans` replaces `loans` and `loansNFT` but leaves `exchange` untouched and does not re-check it. After `setLoans`, `createSaleOffer` approves new-collection NFTs to an exchange wired to the old collection, and `acceptSaleOffer` validates ownership against the new `loansNFT` while trading on the old exchange.

Attack path: 1. The guardian calls `setLoans` with a new pair. 2. The portfolio manager calls `createSaleOffer` or `acceptSaleOffer` against the stale exchange. 3. These calls revert, or act on mismatched collections, until `setExchange` is called.

Impact: Sale-offer operations are broken or inconsistent after a migration. Funds are unlikely to be lost, but the vault is in an invalid configuration without any check.

## [Medium] NAV invalidation relies on lastNavUpdate=0 being older than maxNavAge; large maxNavAge defeats it

File: PortfolioVault.sol
Function: _requireFreshNav()/setMaxNavAge()

`_invalidateNav` only sets `lastNavUpdate = 0`. `_requireFreshNav` then enforces `block.timestamp - lastNavUpdate <= maxNavAge`. `setMaxNavAge` only requires a value greater than 0. If `maxNavAge >= block.timestamp`, the check passes even after invalidation. In that case approvals can run against a NAV that `fundLoans`, `collectCashflows`, `addLoansToNav` or `removeLoansFromNav` explicitly marked stale. There is no separate invalidated flag.

Attack path: 1. `maxNavAge` is set to a very large value (admin or guardian misconfiguration, or an intentional 'never stale' setting). 2. The manager calls `fundLoans` or `removeLoansFromNav`, which invalidate NAV. 3. `approveDeposit` and `approveRedemption` still pass the freshness check and use the outdated `lastNav`.

Impact: Deposits and redemptions can be priced off a NAV that no longer matches the vault's holdings. This requires a privileged misconfiguration.

## [Medium] fundLoans admits loan IDs into NAV without checking vault ownership

File: PortfolioVault.sol
Function: _fundLoans()

`_fundLoans` calls `loans.fund(loanId, ...)` and then `_addLoanToNav(loanId)`. The NatSpec says callers guarantee ownership, but `_fundLoans` has no `ownerOf == address(this)` check, unlike `addLoansToNav` and `acceptSaleOffer`. If `Loans.fund` does not require the caller to own the NFT, the vault's USDC goes into a loan it does not hold. The loan ID is then recorded in `_navLoanIds`. The next `updateNav` removes the entry because ownership fails, so the funded amount silently drops out of NAV. Whether this is reachable depends on `Loans.fund`, which I did not read.

Attack path: 1. A PORTFOLIO_MANAGER (trusted, or compromised, or making an input error) calls `fundLoan` with a loanId the vault does not own. 2. Funds leave the vault. 3. The next NAV sweep drops the entry, so NAV and share price fall.

Impact: A manager mistake or compromise can move vault assets into loans the vault does not hold. The loss falls on investors and is not detected.

## [Medium] acceptSaleOffer spends cash without invalidating NAV if the offer delivers no NFTs

File: PortfolioVault.sol
Function: acceptSaleOffer()

acceptSaleOffer() reduces vault cash by offer.price and never calls _invalidateNav(). It relies on the ownership-nonce bump from an incoming NFT transfer to make _requireFreshNav() fail. Loan IDs are only checked in the post-loop `ownerOf` check, which runs once per listed loan. If an offer lists no loans, or lists loans the vault already owns, the loop adds nothing, no new transfer into the vault occurs, and the nonce does not change. Cash has left the vault, but lastNav, lastNavUpdate and the nonce still pass _requireFreshNav() with the pre-purchase value.

Attack path: 1) A seller creates an offer on the configured exchange with price P and an empty or already-owned loan set, which depends on whether LoansExchange.createOffer allows that. 2) The portfolio manager accepts it, so P leaves the vault. 3) approveDeposit or approveRedemption is run against the cached lastNav, which is now overstated by P, until the next updateNav.

Impact: Shares are minted or burned at an overstated NAV for up to maxNavAge. This requires a permissive exchange and a manager mistake, so the likelihood is low.
