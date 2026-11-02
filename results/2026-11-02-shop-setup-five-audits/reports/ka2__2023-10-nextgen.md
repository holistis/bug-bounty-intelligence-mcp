# Audit report

## [High] Reentrancy via _safeMint callback bypasses per-address mint limits and the 1-mint-per-period rule

File: NextGenCore.sol
Function: mint()

In `NextGenCore.mint`, `_mintProcessing` calls `_safeMint`, which invokes `onERC721Received` on the recipient. This happens before `tokensMintedAllowlistAddress` or `tokensMintedPerAddress` is incremented. `NextGenMinterContract.mint` reads those counters (`retrieveTokensMintedPublicPerAddress`, `retrieveTokensMintedALPerAddress`) before calling `gencore.mint`, and it updates `lastMintDate` only after the whole mint loop. A contract recipient can call `Minter.mint` again from inside the callback. The counters are still stale, so the `Max` and `AL limit` checks pass again. For salesOption 3, the `tDiff >= 1` check also passes because `lastMintDate` has not yet been updated.

Attack path: 1. The attacker deploys a contract that implements `onERC721Received` and passes itself as `_mintTo`. 2. It calls `Minter.mint` for N tokens, N ≤ the cap. 3. During the first token's callback it calls `Minter.mint` again, nested to any depth, and each level reads stale counters. 4. It pays for every token but exceeds `maxCollectionPurchases` or its allowlist `_maxAllowance`. On salesOption 3 it also mints several tokens within one period.

Impact: Per-wallet caps and allowlist allowances are unenforced. A single actor can mint up to the full collection supply, and the periodic-sale control is defeated.

## [High] claimAuction and cancelBid both valid at t==endTime; bids never invalidated after payout (double spend)

File: AuctionDemo.sol
Function: claimAuction() / cancelBid() / cancelAllBids()

claimAuction requires block.timestamp >= endTime, while cancelBid and cancelAllBids require block.timestamp <= endTime. At block.timestamp == endTime both are callable. claimAuction never sets auctionInfoData[..].status = false for the winning bid after paying owner() or for the bids it refunds. It also makes external calls (safeTransferFrom to the winner, ETH refunds to bidders) before any bid is invalidated. A recipient of the call can re-enter cancelBid(tokenid, index) or cancelAllBids at the same timestamp. The bid is still status==true, so it gets refunded a second time. The contract pays this from ETH belonging to other bidders or to the owner payout. The winner can also call cancelBid after claimAuction in the same block and get the winning bid back while keeping the NFT.

Attack path: 1) Attacker contract bids highest on token X. 2) At the block where block.timestamp == endTime, the attacker (as winner) calls claimAuction. 3) In onERC721Received, or in the receive() of a refunded bid, it calls cancelBid(X, idx) for its own still-active bid. 4) The auction contract refunds the bid. claimAuction then continues and pays owner() the highestBid from the contract's remaining balance, which holds other bidders' funds. The attacker keeps the NFT and the refund. Alternatively the winner calls claimAuction and then cancelBid in the same block without any callback.

Impact: Theft of the NFT with the winning bid refunded, or draining of other bidders' escrowed ETH. Later refunds in the same loop fail silently (success is ignored), so those bidders lose their funds.

## [High] Reentrancy via ERC721 receiver callback in mint() bypasses allowlist/public caps and 1-per-period limit

File: MinterContract.sol
Function: mint()

mint() checks the per-address limits (`_maxAllowance >= retrieveTokensMintedALPerAddress + _numberOfTokens`, `retrieveTokensMintedPublicPerAddress + _numberOfTokens <= viewMaxAllowance`) before the minting loop. The counters (`tokensMintedAllowlistAddress` / `tokensMintedPerAddress`) are only incremented in NextGenCore.mint() after `_mintProcessing`, which calls `_safeMint` and therefore the recipient's onERC721Received. For salesOption 3, `lastMintDate` is also written only after the loop. A contract passed as `_mintTo` can re-enter `mint()` from the callback while the counters and `lastMintDate` are still stale. Every nested call passes the same checks, and neither the minter nor the core has a reentrancy guard.

Attack path: 1. Attacker deploys a contract that implements onERC721Received and calls minter.mint(). 2. The attacker calls mint() with `_mintTo` set to that contract, for a quantity allowed by the allowlist or the public cap. 3. In the callback for the first token the contract calls mint() again with the full allowed quantity. The stored counters are still 0 and the nested call is paid for with its own msg.value. 4. Repeat recursively, each level minting up to the limit. For sale option 3, the stale `lastMintDate` lets several tokens be minted in the same period.

Impact: A user can mint far more than their merkle allowance or the public maxCollectionPurchases. They can also mint several tokens in one period in a timed-sale collection. This breaks the allocation and fairness guarantees of the sale, and the attacker can take the scarce supply.

## [High] Public/allowlist mint limits bypassed by reentrancy through _safeMint callback

File: NextGenCore.sol
Function: mint()

NextGenCore.mint() calls _mintProcessing(), which ends in _safeMint() and the receiver's onERC721Received callback. Only after that does it increment tokensMintedAllowlistAddress or tokensMintedPerAddress. MinterContract.mint() checks the per-address limit (`retrieveTokensMintedPublicPerAddress + _numberOfTokens <= viewMaxAllowance`, or the AL `_maxAllowance` check) once, before the mint loop. During the callback the counters have not moved yet, so a contract passed as _mintTo can call MinterContract.mint() again and pass the same check. Each nested call mints more tokens, and the counters are only updated while the stack unwinds.

Attack path: 1. The attacker deploys a contract that implements onERC721Received. 2. It calls MinterContract.mint() with _mintTo set to itself and msg.sender set to itself, within the allowed quantity. 3. In onERC721Received it calls MinterContract.mint() again, and repeats until supply runs out or it chooses to stop. 4. Every nested call passes the limit check because the counter is still 0. It pays the price each time.

Impact: A single address can mint far beyond maxCollectionPurchases or its allowlist allowance, up to the whole collection. This breaks the fair-distribution guarantees of the sale. The attacker still pays the mint price for each token.

## [High] Reentrancy via _safeMint bypasses allowlist and public mint limits before counters update

File: NextGenCore.sol
Function: mint()

NextGenCore.mint() calls _mintProcessing(), which runs _safeMint and invokes onERC721Received on _mintTo, before it increments tokensMintedAllowlistAddress or tokensMintedPerAddress. MinterContract.mint() checks the limits (`_maxAllowance >= retrieveTokensMintedALPerAddress + _numberOfTokens`, and `retrieveTokensMintedPublicPerAddress + n <= viewMaxAllowance`) before the loop and has no reentrancy guard. When the callback re-enters minter.mint(), the counters have not changed yet, so the same limit checks pass again. The minter also does the salesOption 3 `lastMintDate` update after the mint loop, so the '1 mint/period' check can be bypassed the same way.

Attack path: 1. The attacker uses a contract wallet as `_mintTo`, with an allowlist entry or in the public phase. 2. They call mint() with n tokens and pay the price. 3. In onERC721Received during the first token's _safeMint, they call mint() again. The AL, public and period checks still see the old counters, so the nested call passes. 4. They repeat to any depth and pay for each call separately.

Impact: The per-address allowlist allowance, the public max purchases and the salesOption 3 one-per-period rule can all be exceeded. One wallet can take a disproportionate share of a limited collection.

## [Medium] Winner claim can be permanently blocked (non-receiver winner or revoked approval), locking all bids

File: AuctionDemo.sol
Function: claimAuction()

claimAuction sends the NFT with safeTransferFrom(ownerOfToken, highestBidder, id) inside the loop. A revert from that call reverts the whole claim, and no other path releases funds. Bids cannot be cancelled after endTime, so every bidder's ETH is stuck. The revert happens if the highest bidder is a contract without onERC721Received, or one that reverts in it. It also happens if the current token owner has not approved the auction contract, or has transferred the token elsewhere and the new owner has not approved it. The NFT is never escrowed, since it stays with the airdrop recipient, who can revoke approval or move the token at any time. A bidder can also deliberately win with a reverting contract in the last block.

Attack path: 1) An attacker contract with a reverting or missing onERC721Received places the highest bid just before endTime. Alternatively the token holder revokes approval or transfers the token. 2) After endTime, claimAuction reverts for the winner and for admins. 3) cancelBid and cancelAllBids revert because the auction has ended. 4) All active bids are locked forever.

Impact: Permanent loss of all bidders' escrowed ETH, and the auction can never settle.

## [High] Claim and cancel both valid at block.timestamp == auction end: reentrant double refund drains the auction contract

File: AuctionDemo.sol
Function: claimAuction()

claimAuction() requires `block.timestamp >= endTime`, while cancelBid() and cancelAllBids() require `block.timestamp <= endTime`. At exactly endTime both are callable. claimAuction() makes external calls (safeTransferFrom to the winner, which triggers onERC721Received, and ETH refunds to losing bidders) and does not set status=false on the bids it pays out or refunds. A winning or losing bidder contract can re-enter cancelBid() or cancelAllBids() from its receive hook or onERC721Received. Its bid still has status==true, so it is refunded a second time, from other bidders' funds held by the contract. The loop then pays `highestBid` to the owner as well.

Attack path: 1. The attacker bids from a contract. 2. In the block whose timestamp equals the auction end time, the attacker or an admin calls claimAuction(). 3. The attacker's contract receives the NFT (if it won) or its refund (if it lost) and re-enters cancelBid() or cancelAllBids(). 4. The attacker is refunded its bid, but claimAuction() still pays the owner highestBid, or still refunds the other bidders, out of the pooled balance. 5. Later payouts fail or underpay other bidders.

Impact: Theft of other bidders' escrowed ETH. A winner can also get the NFT while recovering their bid.

## [Medium] A reverting winner (or missing approval) makes claimAuction revert forever, locking all bids

File: AuctionDemo.sol
Function: claimAuction()

After endTime, cancelBid() and cancelAllBids() are blocked, and the only way to return funds is claimAuction(). That function begins with `safeTransferFrom(ownerOfToken, highestBidder, id)` inside the bid loop. If the highest bidder is a contract that lacks or reverts in onERC721Received, the whole call reverts. The same happens if the token owner has not approved the auction contract. claimAuction() can be retried by anyone, including an admin, but returnHighestBidder() deterministically returns the same winner, so it can never succeed. The loop also rolls back all refunds to losing bidders.

Attack path: 1. The attacker bids from a contract that rejects ERC721 receipts, with a bid just above the others. 2. The auction ends. 3. Every claimAuction() call reverts. 4. The honest bidders' ETH remains in the contract with no withdrawal path.

Impact: Permanent lock of every bidder's funds for that token, and the auction can never settle. The attacker loses only its own bid.

## [Medium] Token hash is predictable and the mint can be reverted, so rarity can be sniped (RandomizerNXT / XRandoms)

File: RandomizerNXT.sol
Function: calculateTokenHash()

The hash is keccak256(mintIndex, blockhash(block.number-1), randoms.randomNumber(), randoms.randomWord()). XRandoms derives randomNumber and randomWord from block.prevrandao, blockhash(block.number-1) and block.timestamp, all known inside the transaction. The hash is also written synchronously in the same transaction (NextGenCore.setTokenHash). A minting contract can read retrieveTokenHash(tokenId) in its onERC721Received hook, or right after the mint call returns, evaluate the traits, and revert if it dislikes the result. The _saltfun_o argument is not used.

Attack path: 1. The attacker deploys a contract that mints via MinterContract.mint(). 2. After the mint it reads NextGenCore.retrieveTokenHash(). 3. It computes whether the generative output is rare. 4. If it is not rare, it reverts the whole transaction and retries in the next block. Only rare mints are kept.

Impact: Attackers can cherry-pick the rarest tokens from collections that use RandomizerNXT. This undermines the fairness of generative minting.

## [High] AuctionDemo.claimAuction refunds without clearing bid status; cancelBid can double-refund at endTime

File: AuctionDemo.sol
Function: claimAuction()

`claimAuction` refunds every non-winning active bid with a low-level call but never sets `auctionInfoData[..][i].status = false`. `claimAuction` is allowed when `block.timestamp >= endTime`, and `cancelBid`/`cancelAllBids` are allowed when `block.timestamp <= endTime`. At exactly `endTime` both can run. A losing bidder's contract can reenter `cancelBid(tokenid, index)` from its receive hook. Its bid is still `status == true`, so it is refunded a second time, paid from other bidders' funds, including the winner's bid. The same applies to `cancelAllBids`.

Attack path: 1. The attacker places a bid from a contract. 2. `claimAuction` is called in a block with timestamp == `getAuctionEndTime`. The attacker can do this itself if it is the winner, or a block producer can time it. 3. In the refund loop the attacker's receive hook calls `cancelBid` for its own index and is paid again. 4. It repeats for its other bids.

Impact: The auction contract's balance, which holds all bidders' ETH including the winner's payment, can be drained.

## [Medium] Token randomness is fully predictable and can be filtered by an atomic minting contract

File: RandomizerNXT.sol
Function: calculateTokenHash()

The token hash is `keccak256(mintIndex, blockhash(block.number-1), randoms.randomNumber(), randoms.randomWord())`. `randomPool` derives its values from `prevrandao`, `blockhash(block.number-1)` and `block.timestamp`, all readable on-chain in the same transaction. `mintIndex` is `min + circulationSupply`, which is also predictable. A contract minter can compute the resulting hash, and therefore the generative traits, before minting, and revert if the outcome is unfavourable. `_saltfun_o` is ignored.

Attack path: 1. The attacker contract replicates the hash formula using the next mint index and the current block values. 2. If the traits are rare or desirable it calls `Minter.mint`, otherwise it reverts. 3. It repeats until it gets the desired token.

Impact: Rare outputs can be cherry-picked at cost of gas only, which undermines the fairness of the generative collection.

## [Medium] Delegation expiry ignored: expired delegations still authorize allowlist minting and external burn/swap

File: MinterContract.sol
Function: mint() / burnOrSwapExternalToMint()

The minter authorizes delegates with dmc.retrieveGlobalStatusOfDelegation(...), which only checks `globalDelegationHashes[hash].length > 0`. That function never compares `expiryDate` with block.timestamp. registerDelegationAddress accepts any `_expiryDate`, including one in the past, and stores it. The minter never calls the expiry-aware getters (retrieveActiveDelegators and similar), so a delegation that has expired still counts as valid until the delegator explicitly revokes it.

Attack path: 1. A cold wallet delegates use case 1 or 2 to a hot wallet with a short expiry. 2. The expiry passes and the cold wallet does not revoke. 3. The hot wallet, or whoever has compromised it, calls mint() with `_delegator` set to the cold wallet and uses the cold wallet's allowlist allowance, minting to any `_mintTo`. 4. The same wallet can call burnOrSwapExternalToMint on the cold wallet's tokens.

Impact: An expired delegate can consume the delegator's allowlist allocation and force burns or swaps of the delegator's external NFTs.

## [Medium] Unbounded bid array loops allow gas DoS of bidding, cancelling and claiming

File: AuctionDemo.sol
Function: participateToAuction() / returnHighestBid() / claimAuction()

Every bid is pushed to auctionInfoData[_tokenid] and never removed. participateToAuction, returnHighestBid, returnHighestBidder, claimAuction and cancelAllBids all iterate over the whole array. There is no minimum bid increment, because the check is only msg.value > highest bid. An attacker can append thousands of bids that each raise the price by 1 wei, until the loops exceed the block gas limit. claimAuction runs the loop several times, with ETH refund calls inside, and so becomes uncallable. The WinnerOrAdminRequired modifier also calls returnHighestBidder, so even admins cannot claim.

Attack path: 1) The attacker places many sequential bids that each exceed the previous by 1 wei. 2) Cancelling and bidding become too expensive. 3) After endTime, claimAuction runs out of gas. 4) Funds and the NFT are stuck.

Impact: Auction bricked, with all bidders' ETH locked and no settlement. The attack cost is only gas plus the bid value, which is locked in the contract.

## [Medium] Highest bid can be cancelled up to the last second (shill / bid-sniping manipulation)

File: AuctionDemo.sol
Function: cancelBid() / cancelAllBids()

Bids are freely cancellable until block.timestamp <= endTime, including the highest bid, with no penalty or cooldown. A bidder can place a very high bid to deter others, then cancel it in the last block. No one can respond, and the winning price collapses to the next-highest active bid.

Attack path: 1) The attacker bids a huge amount early to discourage competitors. 2) At endTime, in the last block, the attacker calls cancelBid. 3) The attacker also places a low bid earlier or later, and wins at a low price.

Impact: The seller loses the real price discovery. Honest bidders are discouraged, and the auction outcome is manipulable.

## [Medium] Failed ETH payouts/refunds are ignored in claimAuction, permanently trapping funds

File: AuctionDemo.sol
Function: claimAuction()

claimAuction sets auctionClaim[_tokenid]=true first. It then sends refunds and the winning payment with a low-level call whose result is only emitted in an event, never enforced. If a refund recipient reverts, or the owner() payment fails, the ETH stays in the contract. Bid statuses remain true, but claimAuction can never be run again and there is no withdraw function. A malicious bidder contract with a reverting receive can intentionally lock its own bid. More importantly, if owner() is a contract that cannot receive ETH, the winner receives the NFT while the payment is stuck forever.

Attack path: 1) A bidder with a reverting receive() places a non-winning bid. 2) claimAuction marks the auction as claimed and the refund call fails. 3) The ETH remains in the contract with no recovery path.

Impact: Permanent loss or locking of refund or sale proceeds.

## [Medium] Delegation status ignores expiryDate and token scope, so expired or token-specific delegates can still mint on the delegator's allowlist

File: NFTdelegation.sol
Function: retrieveGlobalStatusOfDelegation()

retrieveGlobalStatusOfDelegation() returns `globalDelegationHashes[hash].length > 0`. It never compares the stored `expiryDate` with block.timestamp and never looks at `allTokens` or `tokens`. MinterContract.mint() and burnOrSwapExternalToMint() use this function as their only delegation check (use cases 1 and 2). Registering a delegation with a past or short expiry therefore grants permanent rights until the delegator calls revoke explicitly. A delegation limited to a single token id (allTokens=false) is also treated as a full delegation. The sub-delegation checks in the registration and revocation functions use `retrieveDelegators`, which also ignores expiry.

Attack path: 1. A delegator delegates a hot wallet with an expiry date, or for one tokenId only. 2. The expiry passes, or the delegator expects the delegation to be limited. 3. The delegate calls mint() with `_delegator` set to the delegator, or burnOrSwapExternalToMint(). The check still passes. 4. The delegate uses the delegator's allowlist allowance, or burns and swaps the delegator's token, with the result minted to a recipient chosen by the delegate.

Impact: Expired or narrower delegations remain fully effective. A delegate can consume the delegator's allowlist allocation, and the minted tokens can go to any address the delegate picks via `_mintTo`.

## [Medium] VRF randomizer callbackGasLimit of 40000 is too low for fulfillRandomWords

File: RandomizerVRF.sol
Function: fulfillRandomWords()

`callbackGasLimit` defaults to 40000. `fulfillRandomWords` does three storage reads (`requestToToken` twice, `tokenIdToCollection`), then an external call into `Core.setTokenHash`. That call does an SLOAD of `randomizerContract`, an SLOAD and an SSTORE of `tokenToHash` (a zero-to-nonzero write, about 22k gas), plus an event. This very likely exceeds 40000 gas, so the Chainlink callback runs out of gas and fails. The request is consumed, and `setTokenHash` is never called.

Attack path: 1. A collection uses the VRF randomizer. 2. Any mint triggers `requestRandomWords`. 3. The callback reverts for lack of gas, and the token's `tokenToHash` stays zero.

Impact: Tokens never receive a hash. `tokenURI` shows 'pending' and the script receives an all-zero hash, so the NFTs are unusable until an admin raises the gas limit. Already-failed requests cannot be re-requested.

## [Medium] Token-specific delegation treated as full-collection delegation in burnOrSwapExternalToMint

File: MinterContract.sol
Function: burnOrSwapExternalToMint()

A delegator can register a delegation limited to one token (`_allTokens == false` with `_tokenId`). retrieveGlobalStatusOfDelegation returns true for any entry under the (delegator, collection, delegate, useCase) hash and does not look at the token id. burnOrSwapExternalToMint only checks that boolean for `ownerOfToken`, then moves `_tokenId` from the owner with safeTransferFrom. The per-token scope is never enforced, so a delegate for one token can act on any other token of that owner in the same collection.

Attack path: 1. The owner delegates only token #A of collection C to a hot wallet. 2. The hot wallet calls burnOrSwapExternalToMint with `_tokenId` = #B, which the owner holds and has approved the minter for. 3. The delegation check passes, and the minter transfers #B to burnOrSwapAddress and mints a new NextGen token to the owner.

Impact: A delegate scoped to one token can force the burn or swap of the owner's other tokens in the collection.

## [Medium] Excess ETH sent on mint is never refunded and is credited to artist/team payouts

File: MinterContract.sol
Function: mint() / burnToMint() / burnOrSwapExternalToMint()

These functions only require `msg.value >= price` and then add the whole msg.value to collectionTotalAmount. There is no refund of the difference. This matters most for salesOption 2 (a price that falls over time), where a user who sends an amount quoted earlier overpays. It also applies to `getPrice * n` when the price changes between quote and inclusion. Any ETH sent above the price is paid out to artist and team through payArtist.

Attack path: 1. A user sends more ETH than getPrice(col) * n. 2. The transaction succeeds and collectionTotalAmount grows by the full msg.value. 3. payArtist later distributes the surplus.

Impact: Users permanently lose any overpayment, which is likely under decreasing-price (Dutch auction) sales.

## [Medium] payArtist() zeroes collectionTotalAmount before payouts and ignores failed transfers, so funds can be stuck

File: MinterContract.sol
Function: payArtist()

payArtist() sets `collectionTotalAmount[_collectionID] = 0` and then makes five low-level `call`s to the artist and team addresses. Failures are only recorded in events and never revert, and the amounts are not credited back. If any recipient reverts, for example a contract that cannot receive ETH, its share stays in the minter while the accounting says it was paid. Three artist addresses and two team addresses are always called, so a single bad address blocks one share. The only recovery is emergencyWithdraw(), which sends the entire balance, including other collections' funds, to the admin owner.

Attack path: 1. Admin runs proposePrimaryAddressesAndPercentages with an address that rejects ETH. 2. Admin accepts it. 3. payArtist() is called. That recipient's call fails, the accounting is zeroed, and the share cannot be paid again through payArtist().

Impact: The artist's or team's share of sale proceeds is locked in the minter and mixed with other collections' escrow. Only an emergency admin action can move it, and it will go to the owner rather than the intended recipient.

## [Medium] VRF callbackGasLimit of 40,000 is likely too low for fulfillRandomWords, leaving tokens at 'pending' forever

File: RandomizerVRF.sol
Function: fulfillRandomWords()

The callback reads tokenIdToCollection and requestToToken (three SLOADs), emits an event, and calls NextGenCore.setTokenHash. The core call does an external call with an SLOAD of randomizerContract, an SLOAD of tokenToHash, and an SSTORE from zero to nonzero (about 22k gas). The total is about 40k gas or more with cold accesses. Chainlink does not revert when a callback runs out of gas. It marks the request as failed and does not retry. The token's tokenToHash then stays 0.

Attack path: 1. Tokens are minted while the default callbackGasLimit is 40000. 2. The VRF fulfillment callback runs out of gas. 3. setTokenHash is never called. 4. The affected tokens return 'pending' from tokenURI and have a zero hash for generative scripts.

Impact: Minted NFTs may never receive their hash or metadata. Changing the gas limit later does not repair requests that have already failed, because no re-request function exists.

## [Medium] Minter keeps all excess ETH; Dutch-auction minters overpay with no refund

File: MinterContract.sol
Function: mint()

The minter requires `msg.value >= getPrice(col) * _numberOfTokens`, but it never refunds the excess. The whole `msg.value` is added to `collectionTotalAmount` and later paid out as primary sales. The same applies in `burnToMint` and `burnOrSwapExternalToMint`. For salesOption 2 the price falls with time, so a transaction sent at the previous price and included later overpays. For salesOption 3 the price grows with each mint, so a user who sends the old price after a mint is reverted. Overpayment is otherwise silently kept.

Attack path: 1. A user sends a mint during a Dutch auction with the displayed price, or with a safety margin. 2. The transaction is included after the price has dropped. 3. The difference is not returned and is distributed to the artist and team.

Impact: Users lose funds on every mint where the price falls or where they overpay.

## [Medium] Winner determination and claim depend on array order, and refunds do not update bid status

File: AuctionDemo.sol
Function: returnHighestBidder()

returnHighestBidder() never updates the local highBid inside its loop, so it returns the last active bid in the array rather than comparing bids. This works only because participateToAuction() enforces strictly increasing bids. If no bid is active, or the array is empty, the function reverts, or panics with an out-of-bounds read. WinnerOrAdminRequired calls it first, so every call to claimAuction() for such a token reverts, including calls by admins. claimAuction() also leaves status==true on refunded bids and never records what has been paid out.

Attack path: 1. All bidders cancel, or no one bids. 2. Nobody can call claimAuction(), including the admin. 3. Separately, any bid left active after claimAuction() stays cancellable at the end-timestamp edge (see the reentrancy finding).

Impact: Fragile and inconsistent state. This enables the double-refund path, and an auction with no active bids cannot be cleanly closed.

## [Medium] RNG randomizer reverts every mint if it is not funded or ethRequired is zero or stale

File: RandomizerRNG.sol
Function: calculateTokenHash()

Every mint calls `calculateTokenHash`, which calls `requestRandomWords(_mintIndex, ethRequired)`. That forwards `{value: ethRequired}` to the arRNG controller from the randomizer's own balance. The contract holds no ETH unless an admin funds it manually through `receive()`. Minting ETH goes to the Minter, not here. If the balance is below `ethRequired`, or the controller's fee exceeds the stored `ethRequired`, the request reverts and the whole `Minter.mint` / `airDropTokens` / `burnToMint` transaction fails. `emergencyWithdraw` can also drain the balance. Also, `fulfillRandomWords` ends in `Core.setTokenHash`, which can revert and leave a token with no hash.

Attack path: No attacker is needed. The balance runs out, or the fee rises, and all minting for collections using this randomizer halts.

Impact: Denial of minting. The cost of randomness is not charged to minters, so the team subsidises it with no automatic top-up.

## [Medium] salesOption 3 lastMintDate derived from circulation supply; airdrops and burn-mints desync the schedule

File: MinterContract.sol
Function: mint()

After a period-gated mint, `lastMintDate = allowlistStartTime + timePeriod * (viewCirSupply - 1)`. Circulation supply is also incremented by `airDropTokens`, `mintAndAuction`, `burnToMint` and external burn mints. Those paths do not respect the period. Once such tokens exist, the next period-gated mint sets `lastMintDate` to a time far in the future. The following mints then fail the `tDiff >= 1` check until that time arrives, which stalls the sale. Conversely, if mints lag behind schedule, `lastMintDate` falls behind real time, so several back-to-back mints are allowed. The check also happens after the mint loop, as a revert.

Attack path: 1. An admin airdrops or runs `mintAndAuction` for k tokens on a salesOption 3 collection. 2. The next public mint sets `lastMintDate` about k periods in the future. 3. Further public mints revert for k periods.

Impact: The sale can be frozen or mis-scheduled.

## [Medium] payArtist zeroes the collection balance and ignores failed transfers, leaving ETH stranded

File: MinterContract.sol
Function: payArtist()

payArtist sets collectionTotalAmount[_collectionID] = 0 before sending. It then sends five low-level calls and only emits the success flags, with no revert or retry on failure. If any recipient reverts, that share stays in the contract but is no longer recorded for the collection. Nothing can pay it out again except emergencyWithdraw, which sends the whole contract balance to the admin owner. The contract holds ETH for all collections, and the percentages (artist addresses' add1/2/3 percentages, which are set against the splits at proposal time) are not re-validated here against the current `collectionRoyaltiesPrimarySplits`.

Attack path: 1. A recipient address (an artist or team address) reverts on receive, or is a non-payable contract. 2. An admin calls payArtist. 3. The call to that recipient fails, but collectionTotalAmount is already 0. 4. The recipient's share is stuck, or is recovered only through the all-balance emergencyWithdraw.

Impact: Funds for a collection can become unclaimable by the right party, and the accounting no longer matches the contract balance.

## [Medium] Bids accepted at t==endTime after claim become unrecoverable

File: AuctionDemo.sol
Function: participateToAuction()

participateToAuction allows block.timestamp <= endTime and does not check auctionClaim. claimAuction is allowed from block.timestamp >= endTime. In the block where timestamp == endTime, a claim can execute first and a later bid in the same block is still accepted. That bid is pushed after settlement, and auctionClaim is already true. It cannot be refunded or claimed again, and cancelBid works only for timestamp <= endTime, so it is only possible within the same block.

Attack path: 1) At timestamp == endTime, claimAuction is mined. 2) A user's participateToAuction is then included in the same block and succeeds. 3) The ETH is stuck permanently.

Impact: Loss of the late bidder's funds. This is low probability.

## [Medium] Excess ETH on mint paths is not refunded and is credited to the collection proceeds

File: MinterContract.sol
Function: mint()

mint(), burnToMint() and burnOrSwapExternalToMint() only require `msg.value >= price`, and `collectionTotalAmount += msg.value` adds the whole payment to the collection total. With the descending-price sale option 2 or the increasing-price option 3, the price can change between a user's quote and execution. Anyone who overpays to be safe pays the surplus to the artist and team through payArtist().

Attack path: 1. A user sends more ETH than the current price to avoid a revert. 2. The mint succeeds. 3. The surplus stays in the contract, is counted in `collectionTotalAmount`, and is later paid out to the artist and team.

Impact: Users lose the overpaid ETH with no way to get it back.

## [Medium] payArtist uses stored artist address percentages that can be out of sync with the primary splits

File: MinterContract.sol
Function: payArtist()

`payArtist` checks only `collectionRoyaltiesPrimarySplits.artistPercentage + _teamperc1 + _teamperc2 == 100`. It then pays `add1..3Percentage` from `collectionArtistPrimaryAddresses`, which were validated against the old `artistPercentage` at proposal time. `setPrimaryAndSecondarySplits` can be called again after the addresses have been accepted, and it does not reset the status or revalidate the addresses. The total paid out can then differ from 100% of `royalties`. If it is above 100%, the surplus is taken from other collections' ETH held by the same contract. If it is below, funds are stranded. Failed `.call`s are only logged, and funds from failed calls stay in the contract with `collectionTotalAmount` already zeroed.

Attack path: 1. The splits are accepted for a collection. 2. An admin changes the primary split (a mistake or a malicious change). 3. `payArtist` pays out more or less than the collection's balance.

Impact: A collection's proceeds can be overpaid from other collections' funds, or underpaid and stuck until `emergencyWithdraw`.

## [Medium] Changing primary splits after addresses are accepted desynchronizes artist payouts

File: MinterContract.sol
Function: setPrimaryAndSecondarySplits()

The artist's per-address percentages are checked against `collectionRoyaltiesPrimarySplits.artistPercentage` only when proposed. `setPrimaryAndSecondarySplits()` can be called later and has no check against the stored, already accepted address percentages. After a change, payArtist() requires `artistPercentage + _teamperc1 + _teamperc2 == 100` using the new value. The payouts, however, use the old `add1/2/3Percentage`, so the amounts paid no longer total the pooled funds.

Attack path: 1. Splits are set to artist 50 and team 50, and the artist addresses are accepted with percentages summing to 50. 2. An admin later calls setPrimaryAndSecondarySplits with artist 60 and team 40. 3. payArtist(…, team percentages summing to 40) pays 50% to the artist and 40% to the team. The remaining 10% is left in the contract and not tracked, and the reverse change would overpay.

Impact: Part of the proceeds can become untracked and stuck, or the contract can try to pay out more than the collection total, using funds from other collections.

## [Medium] burnToMint lets any approved operator burn an owner's token and mints to the owner at the operator's expense

File: NextGenCore.sol
Function: burnToMint()

`burnToMint` checks `_isApprovedOrOwner(burner, _tokenId)`, so any address with per-token approval or `setApprovalForAll` (marketplaces, escrow) can burn a token. The new token is minted to `ownerOf(_tokenId)`, not to the caller. The token is burned after `_mintProcessing`, whose `_safeMint` callback runs before `_burn`. A recipient contract can move the token to another account inside the callback, and the new owner's token is then burned.

Attack path: 1. A user has approved an operator, or an operator contract has approval over a victim's token. 2. The operator calls `Minter.burnToMint` and pays the mint price. 3. The victim's token is burned and the replacement lands with the owner. Alternatively the owner reenters during `onERC721Received` and transfers the token away just before the burn.

Impact: Unintended burn of approved tokens and a loss of the burn-collection token without the owner's consent. It can also be used to grief.

## [Medium] Primary/secondary split can be changed after addresses are approved, so payouts no longer match the artist share

File: MinterContract.sol
Function: setPrimaryAndSecondarySplits() / payArtist()

proposePrimaryAddressesAndPercentages checks that the three address percentages sum to `collectionRoyaltiesPrimarySplits.artistPercentage` at proposal time. setPrimaryAndSecondarySplits can be called later at any time and does not reset or re-check the approved addresses (status stays true). payArtist then pays `royalties * addXPercentage / 100` from the stale percentages, but it validates the team side against the new artistPercentage. The artist and team payouts can therefore sum to more than 100%, or less. When they sum to more, the surplus is taken from other collections' ETH held in the same contract.

Attack path: 1. The splits are set to artist 50 / team 50, and the artist addresses are proposed (summing to 50) and approved. 2. An admin later calls setPrimaryAndSecondarySplits with artist 30 / team 70. 3. payArtist(…, 70) still pays the artist addresses 50% from the old percentages and the team 70%, which is 120% of the collection total.

Impact: Over-distribution can drain other collections' funds, or under-distribution can strand part of the balance.

## [Medium] Artist can front-run approval: acceptAddressesAndPercentages approves a status flag, not the proposed content

File: MinterContract.sol
Function: acceptAddressesAndPercentages()

The admin approval takes only `_collectionID` and booleans and sets status = true on whatever addresses are currently stored. The artist (or any admin with the function permission) can call proposePrimary/SecondaryAddressesAndPercentages while status is false. If they do so just before the accept transaction lands, the admin approves addresses they never reviewed. After status is true, the proposals are locked with 'Already approved'.

Attack path: 1. The artist proposes a benign address set. 2. The admin reviews it and sends accept. 3. The artist front-runs with a different address set. 4. The accept lands and locks the replaced addresses.

Impact: Primary sale proceeds or secondary royalties can be redirected to addresses the team did not review.

## [Medium] Function-admin permissions are keyed only by selector and shared across all contracts

File: NextGenAdmins.sol
Function: registerFunctionAdmin()

functionAdmin[address][bytes4] is not scoped to a contract. Core, Minter, RandomizerNXT and RandomizerRNG all use the same NextGenAdmins and check `retrieveFunctionAdmin(msg.sender, this.fn.selector)`. Functions with identical signatures share a selector across contracts: updateAdminContract(address), updateCoreContract(address) and emergencyWithdraw(). Granting an address permission for one of them (for example just the minter's emergencyWithdraw) also grants it on the other contracts that have the same function. That can mean replacing the admin contract on NextGenCore or draining the RNG randomizer.

Attack path: 1. The owner grants a limited admin the selector for updateAdminContract(address) to manage the minter. 2. That address calls NextGenCore.updateAdminContract with a malicious admin contract whose isAdminContract() returns true. 3. It then controls every permissioned function in Core.

Impact: Privilege escalation across contracts beyond the intended permission scope.

## [Medium] setCollectionData can be re-run when collectionTotalSupply is zero, resetting circulation supply

File: NextGenCore.sol
Function: setCollectionData()

The 'first-time' branch is selected by `collectionTotalSupply == 0`, not by `wereDataAdded`. After `setFinalSupply` is run with circulation 0, or if a collection is initialised with total supply 0, the first branch can run again. It resets `collectionCirculationSupply = 0` and recomputes the reserved indexes (with `reservedMax = min - 1`). For a collection with total supply 0 the reserved max falls inside the previous collection's id range. `Minter.mint` then computes mint indexes from the reserved min plus circulation, so the id bookkeeping is inconsistent.

Attack path: 1. A collection admin sets `_collectionTotalSupply = 0` (or the final supply collapses to 0). 2. Later calls to `setCollectionData` re-enter the first branch and reset the circulation supply and the freeze-protected values.

Impact: Corrupted token index ranges and supply accounting, with possible id collisions.
