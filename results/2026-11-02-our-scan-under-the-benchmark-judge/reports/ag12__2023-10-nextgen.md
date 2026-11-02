# Audit report

## [High] AuctionDemo: claim and cancelBid both valid at endTime, bids never closed, double payout

File: AuctionDemo.sol
Function: claimAuction()

participateToAuction and cancelBid accept block.timestamp <= endTime while claimAuction accepts block.timestamp >= endTime, so in the second where block.timestamp == endTime both paths are open. claimAuction pays the winning bid to owner() and refunds every other active bid with a raw call but never sets auctionInfoData[tokenid][i].status to false (and does not touch anything cancelBid checks except status). A bidder can therefore call cancelBid or cancelAllBids in the same timestamp, the winner from inside the onERC721Received callback of the safeTransferFrom made by claimAuction, any other bidder right after the claim transaction in the same block, and receive the deposit a second time. The contract holds the ETH of all running auctions in one balance, so the second payout is funded by other bidders or by auctions of other tokens. participateToAuction also never checks auctionClaim, so a bid placed after the claim in that same second can never be refunded.

Attack path: 1) Attacker contract wins an auction whose endTime falls on a second that gets a block. 2) It calls claimAuction (it is the highest bidder, so the modifier passes) with block.timestamp == endTime. 3) claimAuction does safeTransferFrom to the attacker, whose onERC721Received calls cancelBid(tokenid, winningIndex). 4) status is still true, so cancelBid sets it to false and sends the full winning bid back. 5) claimAuction continues and sends highestBid to owner() out of the contract balance, which holds other bidders' deposits. Variant: a non-winning bidder calls cancelBid in the same block right after an admin claim to get its refund twice.

Impact: Winner gets the NFT without paying, or any bidder is paid twice. The shortfall is taken from other bidders and from other tokens' auctions; later refunds use a call whose failure is ignored, so honest bidders are left unpaid.

## [High] Reentrancy through _safeMint in NextGenCore.mint bypasses allowlist and public per-address mint limits

File: NextGenCore.sol
Function: mint()

MinterContract.mint() enforces _maxAllowance (allowlist) and maxCollectionPurchases (public) by reading retrieveTokensMintedALPerAddress / retrieveTokensMintedPublicPerAddress before it calls gencore.mint. NextGenCore.mint() first runs _mintProcessing, which ends in _safeMint and therefore calls onERC721Received on _mintTo, and only afterwards increments tokensMintedAllowlistAddress or tokensMintedPerAddress. During that callback the counters still hold the old value, so a re-entrant MinterContract.mint() passes the same checks again with the same msg.sender. The circulation supply is incremented before the callback, so the total supply cap still holds, but the per-address allowance does not. The same ordering exists in the loop of MinterContract.mint for _numberOfTokens > 1.

Attack path: 1) Attacker deploys a contract that implements onERC721Received and calls MinterContract.mint(col, 1, ..., _mintTo = itself). 2) Minter checks the minted counter (0) and calls gencore.mint. 3) Core mints and calls the attacker's onERC721Received before updating the counter. 4) The callback calls MinterContract.mint again with msg.value for one more token; the counter is still 0 so it passes; repeat recursively until supply or gas runs out. 5) Only afterwards are the counters incremented.

Impact: One address can take most or all of a collection in the allowlist or public phase regardless of its allocation or maxCollectionPurchases, defeating the allowlist and the per-wallet cap.

## [Medium] RandomizerNXT hash is predictable and readable in the mint transaction, so traits can be cherry-picked

File: RandomizerNXT.sol
Function: calculateTokenHash()

calculateTokenHash builds hash = keccak256(mintIndex, blockhash(block.number - 1), randoms.randomNumber(), randoms.randomWord()). XRandoms.randomNumber and randomWord are public views derived from block.prevrandao, blockhash(block.number - 1) and block.timestamp, and mintIndex is min index plus circulation supply, so every input is known inside the same transaction. NextGenCore._mintProcessing calls calculateTokenHash and setTokenHash before _safeMint, so the finished hash can also be read with retrieveTokenHash in the recipient's onERC721Received. A contract minter can compute or read the hash before the mint is final and revert unless the generative traits are rare; block proposers can also bias prevrandao and timestamp.

Attack path: 1) Attacker contract calls MinterContract.mint with itself as _mintTo. 2) In onERC721Received it reads gencore.retrieveTokenHash(tokenId) (or precomputes the same keccak with the public XRandoms views). 3) If the hash maps to a common output it reverts, discarding the mint; otherwise it keeps the token. 4) Repeat per block until only rare outputs are kept.

Impact: Rarity of the generative collection can be farmed deterministically, so the random hash does not provide fair distribution; value goes to whoever automates this.

## [High] claimAuction can be made impossible: gas-burning refund recipients and unbounded bid arrays lock all funds

File: AuctionDemo.sol
Function: claimAuction()

claimAuction refunds every non-winning active bid inside one loop with payable(bidder).call{value: bid}("") that forwards all gas but 1/64 and ignores failure. A bidder contract that burns all forwarded gas (for example with invalid()) leaves the caller with about 1/64 of its gas; with two or three such active bids placed early at tiny increasing amounts, the rest of the loop and the winner transfer run out of gas even with a block-sized gas limit, so the transaction reverts. cancelBid and cancelAllBids are blocked after endTime and the refund logic exists only in claimAuction, so the deposits cannot be recovered. Independently, auctionInfoData[tokenid] only grows (cancelled bids stay with status false), and participateToAuction, returnHighestBid, returnHighestBidder and claimAuction each iterate over the whole array, so bid-cancel-bid cycles by one account bloat it until bidding and claiming run out of gas.

Attack path: 1) At auction start the attacker bids 1, 2, 3 wei from a contract whose receive() executes invalid(). 2) Honest bidders bid higher; the attacker's bids stay active. 3) After endTime the winner or admin calls claimAuction; the loop reaches the attacker's first bid, which burns 63/64 of the gas, then the second and third. 4) The call runs out of gas and reverts, every time, for any gas limit. 5) Nobody can cancel anymore, so all bids are stuck and the NFT is never delivered.

Impact: Permanent loss of availability of the auction settlement; all bidders' ETH (including the winner's) and the sale proceeds are locked in AuctionDemo, which has no rescue function. The attack costs a few wei plus gas.

## [Medium] AuctionDemo claim reverts if winner callback fails or token owner removed approval; funds stuck forever

File: AuctionDemo.sol
Function: claimAuction()

claimAuction does IERC721(gencore).safeTransferFrom(ownerOfToken, highestBidder, tokenid) inside the refund loop. It reverts when the highest bidder is a contract whose onERC721Received reverts or is missing (the bidder can do this on purpose), when AuctionDemo is not approved by the current owner (participateToAuction never checks approval and the owner can revoke it at any time), or when the token was moved or burned so that ownerOf returns another holder or reverts. A revert undoes the whole claim, including refunds, and after endTime cancelBid and cancelAllBids are no longer allowed, so there is no path to get the ETH out. No admin or rescue function exists in AuctionDemo.

Attack path: 1) A contract bidder places the highest bid and its onERC721Received reverts (for example after endTime). 2) After endTime anyone with rights calls claimAuction; safeTransferFrom to the bidder reverts. 3) All later attempts revert too, and cancel is forbidden after endTime, so all deposits stay in the contract. The same happens if the token owner calls setApprovalForAll(auction, false) or transfers the token away during the auction.

Impact: All bidders' ETH is locked permanently and the auction can never be finalized; one malicious bidder (who only risks his own bid) or an unapproved owner can freeze everyone's funds.

## [Medium] Periodic sale: one-per-period rule is a count-based schedule, allows catch-up mints and is skipped by burn mints

File: MinterContract.sol
Function: mint()

For salesOption 3 the gate is tDiff >= 1 where tDiff = (block.timestamp - lastMintDate) / timePeriod, and after each mint lastMintDate is set to allowlistStartTime + timePeriod * (viewCirSupply - 1), a value derived from the token count and not from the time of the last mint. If no one minted for N periods, the first mint sets lastMintDate to a time that is still in the past, tDiff stays >= 1, and further mints with _numberOfTokens == 1 succeed in the same block or period until lastMintDate catches up, so N tokens can be minted at once instead of one per period. burnToMint and burnOrSwapExternalToMint never apply the gate and do not update lastMintDate, yet they raise the circulation supply, which also shifts the schedule used by later mint() calls. The README asks explicitly whether more than one token can be minted in the same period.

Attack path: 1) Wait until several periods have passed with no mint in a periodic collection. 2) Call mint with _numberOfTokens = 1 repeatedly (or from several addresses) in consecutive transactions; each passes because lastMintDate only advanced by one period. 3) Alternatively use burnToMint / burnOrSwapExternalToMint, which have no periodic check at all.

Impact: The intended drip release of one token per period is bypassed, so the scarcity and price curve (which rises with circulation supply) can be front-run by bots that mint several tokens at the low price.

## [Medium] Minter trusts retrieveGlobalStatusOfDelegation, which ignores expiry and token scope

File: MinterContract.sol
Function: mint()

MinterContract.mint (via _delegator) and burnOrSwapExternalToMint authorize a delegate only with dmc.retrieveGlobalStatusOfDelegation(delegator, collection, msg.sender, 1 or 2). In NFTdelegation that function returns globalDelegationHashes[hash].length > 0: it never compares expiryDate with block.timestamp and does not look at allTokens or the single tokens id, and entries only disappear on explicit revoke. The date-aware retrieveStatusOfActiveDelegator is in the interface but is not used. So a delegation that has expired, or one that was granted for one token only, still counts as a full delegation for minting and for burn/swap.

Attack path: 1) Owner delegates a hot wallet for a short period (or for one token) and lets it expire. 2) After expiry the delegate calls mint with _delegator = owner and the owner's merkle leaf; the check passes. 3) The delegate mints the owner's allowlist allocation to _mintTo = itself. In burnOrSwapExternalToMint the delegate can move any in-range token of the owner (the owner approved the Minter) to burnOrSwapAddress.

Impact: An expired or narrower delegation can still consume the delegator's allowlist spots and swap or burn the delegator's external NFTs without current consent.

## [Medium] AuctionDemo pays the winning bid to the auction contract's owner() instead of the token owner

File: AuctionDemo.sol
Function: claimAuction()

claimAuction transfers the NFT out of ownerOfToken but sends highestBid with payable(owner()).call, where owner() is the Ownable owner of the AuctionDemo contract, not ownerOfToken. The README invariant says the owner of the token receives the funds. mintAndAuction mints the token to _recipient through airDropTokens and MinterContract credits no collectionTotalAmount for it, so the holder who supplied the token (artist or team wallet) gets nothing unless it happens to be the auction owner. The result of the call is only emitted as success, so if the owner address cannot accept ETH the winning bid stays in the contract with no way out.

Attack path: 1) Admin runs mintAndAuction with _recipient = artist wallet; the artist approves AuctionDemo. 2) A bidder wins and the winner or admin calls claimAuction. 3) The NFT leaves the artist wallet, the ETH goes to owner() of AuctionDemo.

Impact: Sale proceeds go to the wrong party; the token holder loses the full sale price, or the funds are stuck if the owner transfer fails.

## [Medium] AuctionDemo: bid very high to scare bidders, then cancel at endTime so a minimal bid wins

File: AuctionDemo.sol
Function: cancelBid()

participateToAuction only requires a bid above the highest active bid, and cancelBid allows the bidder to withdraw any of his bids until block.timestamp <= endTime with no penalty or lock. A single account can place a minimal bid early and a very high second bid. Other bidders see the high active bid and are priced out. In the last block before or at endTime the account cancels only the high bid, leaving its minimal bid as the highest active one. Honest bidders can no longer react because participateToAuction closes at the same time.

Attack path: 1) Account bids 1 wei. 2) Same account bids a huge amount so no one outbids it. 3) In the final block before or at endTime it calls cancelBid(tokenid, indexOfHugeBid). 4) The 1 wei bid is now the highest active bid and the account wins the NFT for 1 wei (claimAuction then pays 1 wei to owner()).

Impact: The NFT can be bought far below its market price and honest bidders are manipulated; the seller loses almost the entire sale value.

## [Medium] RandomizerVRF callbackGasLimit of 40000 is likely too low for fulfillRandomWords, hashes never set

File: RandomizerVRF.sol
Function: fulfillRandomWords()

callbackGasLimit is initialized to 40000 and used in COORDINATOR.requestRandomWords. fulfillRandomWords reads requestToToken, tokenIdToCollection and gencoreContract from cold storage, makes an external call to NextGenCore.setTokenHash (cold account, two cold SLOADs, and a zero to non-zero SSTORE of 20000 gas) and emits an event with the array. My estimate of the cost is close to or above 40000 gas (roughly 38k to 42k), so the callback can run out of gas. If the callback fails, Chainlink does not retry, the token keeps tokenToHash == 0 forever, and tokenURI returns the pending URI; there is no way to re-request or set the hash from the Core.

Attack path: 1) Users mint with RandomizerVRF configured. 2) The VRF coordinator calls rawFulfillRandomWords with 40000 gas. 3) The callback runs out of gas, the hash is not written. 4) Because setTokenHash requires an empty slot and only the collection's randomizer can call it, and no re-request function exists, the token stays without hash.

Impact: Minted NFTs permanently lack their random hash and artwork; the collection is unusable until redeployment. Admins can raise the limit only for future requests.

## [Medium] burnToMint burns after the _safeMint callback, so the token can be sold during the callback and the buyer's token is burned

File: NextGenCore.sol
Function: burnToMint()

burnToMint runs _mintProcessing (which ends in _safeMint and calls onERC721Received on ownerOf(_tokenId)) before _burn(_tokenId). The _isApprovedOrOwner(burner, _tokenId) check happened earlier and nothing pins ownership between that check and the burn. _burn re-reads ownerOf(tokenId), so it burns the token of whoever owns it at that moment. If the owner is a contract, its onERC721Received can transfer or sell _tokenId (for example by filling a standing marketplace collection offer from a third party) and the burn then destroys the buyer's token.

Attack path: 1) Attacker contract owns a token of an enabled burn collection and calls MinterContract.burnToMint. 2) Core mints the new token and calls the attacker's onERC721Received. 3) In the callback the attacker fulfils a victim's standing offer for that collection with _tokenId and receives the payment. 4) Core then calls _burn(_tokenId), burning the victim's new token. The attacker keeps the new mint and the proceeds.

Impact: Third parties that buy or bid on tokens can lose the token and payment; the attacker gets the burn-mint reward plus the sale price.

## [Medium] Collection freeze does not cover supply, randomizer and artist signature

File: NextGenCore.sol
Function: setFinalSupply()

The README invariant says that once a collection is frozen its data cannot be altered. setCollectionData, updateCollectionInfo, changeMetadataView, changeTokenData and updateImagesAndAttributes check collectionFreeze, but setFinalSupply, addRandomizer and artistSignature do not. setFinalSupply overwrites collectionTotalSupply and reservedMaxTokensIndex, addRandomizer replaces randomizerContract and randomizer for any collection id, and artistSignature stores a new signature when the artist has not signed yet. If circulation exceeds the earlier total (possible because Core.mint increments the circulation counter even when it skips the mint), setFinalSupply can also raise the supply cap.

Attack path: 1) Collection is frozen via freezeCollection. 2) A function admin calls setFinalSupply or addRandomizer; no collectionFreeze check blocks it. 3) Supply bounds or the hash source of the frozen collection change.

Impact: Frozen collections are not immutable; collectors cannot rely on supply or randomness being fixed.

## [Medium] Collection admin can replace the artist address before signing and then propose payout addresses as artist

File: NextGenCore.sol
Function: setCollectionData()

setCollectionData is gated by CollectionAdminRequired. When total supply is already set and artistSigned is false, the second branch overwrites collectionArtistAddress with the caller's parameter. MinterContract.ArtistOrAdminRequired accepts msg.sender == gencore.retrieveArtistAddress(col), so the new artist address can call proposePrimaryAddressesAndPercentages and proposeSecondaryAddressesAndPercentages. acceptAddressesAndPercentages takes no hash or id of the proposal it approves, so an admin accepting after a swap (or after a front-run) approves the attacker's addresses, and payArtist then pays the artist share to them. A collection admin is meant to manage one collection's data, not to control payment recipients.

Attack path: 1) Collection admin calls setCollectionData(col, attacker, ...) while artistSigned is false. 2) Attacker calls proposePrimaryAddressesAndPercentages(col, attacker, 0, 0, artistPct, 0, 0). 3) The function admin approves with acceptAddressesAndPercentages(col, true, ...). 4) payArtist sends the artist share to the attacker.

Impact: Artist proceeds of a collection can be redirected by a lower-privileged role.

## [Medium] payArtist zeroes collectionTotalAmount before sending and ignores failed transfers, funds stuck outside accounting

File: MinterContract.sol
Function: payArtist()

payArtist sets collectionTotalAmount[col] = 0 before it makes five raw calls and only emits the success flags. If any recipient rejects ETH (a contract address proposed by the artist, or an address that fails for another reason) the share stays in the Minter's balance but is no longer tracked anywhere, so it cannot be paid again. The only way out is emergencyWithdraw, which sends the whole balance to adminsContract.owner(), not to the intended recipient. Similarly, if the percentages stored by proposePrimaryAddressesAndPercentages no longer sum to the artist split because setPrimaryAndSecondarySplits changed afterwards, the artist addresses are paid a different total than the artistPercentage that was checked.

Attack path: 1) The artist proposes a primary address that reverts on receive (or an address that is a contract without receive). 2) The admin accepts and calls payArtist. 3) The call to that address fails silently, collectionTotalAmount is already 0. 4) The share remains locked in MinterContract and can only be swept to the admin owner.

Impact: The artist or team can lose their share permanently, or the shares can be moved to the admin owner instead.

## [Medium] Periodic sale can freeze: lastMintDate lands in the future after airdrops or burn mints and subtraction underflows

File: MinterContract.sol
Function: mint()

viewCirSupply also counts airDropTokens, mintAndAuction, burnToMint and burnOrSwapExternalToMint, but lastMintDate is only written by mint() and mintAndAuction. After k airdropped or burn-minted tokens, the first public mint passes (lastMintDate == 0) and then writes lastMintDate = allowlistStartTime + timePeriod * (circ - 1), which can be far in the future. The next call computes block.timestamp - timeOfLastMint with timeOfLastMint in the future, which underflows under checked arithmetic and reverts, so no one can mint until that time arrives. For the first mint, timeOfLastMint = allowlistStartTime - timePeriod underflows and reverts for every caller whenever allowlistStartTime < timePeriod (for example a public-only periodic sale with allowlist times left at 0).

Attack path: 1) Team airdrops 50 tokens in a periodic collection. 2) One user mints a public token; lastMintDate becomes start + 50 * period. 3) Every further mint reverts with an arithmetic underflow until that time passes. Variant: anyone calls burnToMint repeatedly to push circulation supply forward and cause the same stall.

Impact: The periodic sale halts for many periods, or never starts if allowlistStartTime is 0 on a public-only configuration.

## [Medium] Descending-price sale jumps back to the starting price at block.timestamp == publicEndTime

File: MinterContract.sol
Function: getPrice()

The descending branch of getPrice requires block.timestamp > allowlistStartTime && block.timestamp < publicEndTime, while mint() accepts block.timestamp <= publicEndTime. In the final second (block.timestamp == publicEndTime) getPrice falls into the fixed price branch and returns collectionMintCost, which is the highest price of the curve, instead of the lowest. A mint that lands in that second has to pay the starting price (a mint with msg.value computed from the earlier low price reverts with 'Wrong ETH'; one with more value overpays).

Attack path: 1) Collection uses salesOption 2 with a decay to a low collectionEndMintCost. 2) A user submits a mint priced at the end of the curve. 3) The block gets timestamp == publicEndTime; getPrice returns collectionMintCost and the call reverts or the buyer overpays.

Impact: Buyers in the last second pay many times the intended end price, or their transactions fail.
