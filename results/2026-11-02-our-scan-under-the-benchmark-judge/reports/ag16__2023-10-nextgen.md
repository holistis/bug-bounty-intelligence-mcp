# Audit report

## [High] Auction end-time overlap lets bidders get refunded twice (claimAuction + cancelBid) and drain the contract

File: AuctionDemo.sol
Function: claimAuction()/cancelBid()/cancelAllBids()

claimAuction requires block.timestamp >= minter.getAuctionEndTime(_tokenid) while cancelBid and cancelAllBids require block.timestamp <= getAuctionEndTime(_tokenid), so both are callable in the block whose timestamp equals the end time. claimAuction refunds every losing bidder via a raw call but never sets auctionInfoData[_tokenid][i].status = false, and pays the winner's bid to owner() without clearing the winner's status either. A bidder (or the winner, after receiving the NFT) can therefore call cancelBid in the same block, or re-enter cancelBid from the refund call / onERC721Received callback, and receive bid again. The second payment comes out of ETH that belongs to other auctions' bidders held by the same contract.

Attack path: 1) Attacker bids on an auction (possibly from a contract). 2) At block.timestamp == auctionEndTime, attacker (or anyone) calls claimAuction; attacker gets refunded (or, as winner, gets the NFT and owner() gets the bid). 3) In the same tx via the receive/onERC721Received hook, or in a later tx in the same block, attacker calls cancelBid(_tokenid, index) whose status is still true and gets bid paid out again. Repeat across auctions.

Impact: Theft of ETH bid by other users in other auctions; winner can obtain NFT for free; contract becomes insolvent so later claims/refunds fail silently.

## [High] Reentrancy through _safeMint bypasses per-address allowlist and public mint limits

File: NextGenCore.sol
Function: mint() / MinterContract.mint()

MinterContract.mint checks gencore.retrieveTokensMintedPublicPerAddress(col, msg.sender) + _numberOfTokens <= viewMaxAllowance(col) (or the AL equivalent against _maxAllowance) once, then calls gencore.mint in a loop. NextGenCore.mint calls _mintProcessing, which calls _safeMint and thus onERC721Received on _mintTo, before it increments tokensMintedPerAddress / tokensMintedAllowlistAddress. A contract receiver can re-enter MinterContract.mint from the callback; the limit check reads the not-yet-incremented counter and passes again. Only collectionCirculationSupply is updated before the callback, so the total supply cap holds but per-wallet caps do not.

Attack path: 1) Attacker deploys contract C whose onERC721Received calls MinterContract.mint again (paying the price) while a counter is below N. 2) C calls mint with _numberOfTokens = maxAllowance during public phase (or AL with valid proof). 3) Each nested call passes the per-address check because tokensMintedPerAddress is only incremented after _safeMint returns. 4) C mints far more than maxCollectionPurchases or its allowlist allocation.

Impact: A single address can mint an unbounded share of a collection (allowlist or public), defeating fair-distribution limits and starving other users.

## [High] burnToMint mints (with callback) before burning, letting owner sell the to-be-burned token

File: NextGenCore.sol
Function: burnToMint()

NextGenCore.burnToMint verifies _isApprovedOrOwner(burner, _tokenId) and then calls _mintProcessing(mintIndex, ownerOf(_tokenId), ...), whose _safeMint invokes onERC721Received on the token owner, and only afterwards calls _burn(_tokenId). OZ _burn burns from whoever currently owns the token, without checking it is still the burner. During the callback the owner contract can transfer _tokenId to a buyer (e.g. accept a marketplace offer / sell) and receive payment; the subsequent _burn destroys the token now owned by the buyer.

Attack path: 1) Attacker holds burnable token T in contract C and lists it / has an open offer for it on a marketplace. 2) C calls MinterContract.burnToMint(burnCol, T, mintCol, salt) paying the price. 3) In onERC721Received for the newly minted token, C fulfils the offer, transferring T to the buyer and taking their ETH. 4) Execution continues and _burn(T) burns the buyer's token.

Impact: Buyer loses the NFT they paid for; attacker keeps both the new mint and the sale proceeds.

## [Medium] Bids placed at exactly the auction end time after claimAuction are locked forever

File: AuctionDemo.sol
Function: participateToAuction()

participateToAuction accepts bids while block.timestamp <= getAuctionEndTime, and claimAuction is allowed when block.timestamp >= end time. If claimAuction executes first in the end-time block, any later bid in the same block is pushed to auctionInfoData after auctionClaim[_tokenid] = true. claimAuction can never run again, and cancelBid only works while timestamp <= end time, so after that block there is no path to recover the ETH (only admin emergency, which does not exist in AuctionDemo).

Attack path: 1) claimAuction is called in the block with timestamp == endTime. 2) A user (racing to outbid) calls participateToAuction in the same block with a higher bid. 3) The auction is already claimed; from the next block cancelBid reverts with 'Auction ended' and claimAuction reverts on auctionClaim.

Impact: Permanent loss of the bidder's ETH.

## [Medium] claimAuction push-payment loop can be bricked, locking all bids and the NFT

File: AuctionDemo.sol
Function: claimAuction()

claimAuction iterates the whole unbounded auctionInfoData array (and returnHighestBid/returnHighestBidder iterate it again) and, for the winner, calls IERC721.safeTransferFrom(ownerOfToken, highestBidder, _tokenid), which reverts if the winning contract does not implement onERC721Received or deliberately reverts. Refund calls forward all gas to arbitrary bidder contracts. A malicious winner contract reverting in onERC721Received makes the whole claim revert; cancelBid is closed after end time, so all losing bidders' ETH and the winning bid stay in the contract. Many tiny incremental bids can also push the loop past the block gas limit.

Attack path: 1) Attacker bids last from a contract that reverts in onERC721Received (or spams many 1-wei-increment bids). 2) After end time, any call to claimAuction reverts (NFT transfer revert or OOG). 3) No alternative withdrawal exists, so every bidder's ETH is locked.

Impact: Permanent lock of all bidders' ETH for that auction and the auctioned NFT stays unsold.

## [Medium] Same-transaction hash in RandomizerNXT lets minters reroll until they get rare traits

File: RandomizerNXT.sol
Function: calculateTokenHash()

RandomizerNXT computes the token hash as keccak256(_mintIndex, blockhash(block.number-1), randoms.randomNumber(), randoms.randomWord()), all inputs known within the block (prevrandao, previous blockhash, timestamp). It calls gencore.setTokenHash synchronously inside _mintProcessing, before _safeMint calls onERC721Received on the recipient. A recipient contract can read retrieveTokenHash(tokenId) inside the callback (or precompute it) and revert if the resulting traits are not rare, paying only gas.

Attack path: 1) Attacker contract mints with _mintTo = itself on a collection using RandomizerNXT. 2) In onERC721Received it evaluates retrieveTokenHash(tokenId) against the collection script's rarity logic. 3) If unfavourable it reverts the whole mint; it retries in later blocks until a rare hash appears.

Impact: Attacker can systematically obtain the rarest generative outputs, devaluing the collection for honest minters.

## [Medium] Descending-price sale returns the start price at exactly publicEndTime

File: MinterContract.sol
Function: getPrice()

For salesOption == 2, getPrice applies the decreasing schedule only when block.timestamp < publicEndTime, otherwise it falls through to the fixed-price branch returning collectionMintCost (the highest price). mint() allows minting while block.timestamp <= publicEndTime. At timestamp == publicEndTime a buyer expecting the end price is charged the start price; msg.value >= getPrice check uses this value and the surplus is not refunded.

Attack path: 1) Dutch-auction collection is near its end. 2) A user submits mint with msg.value equal to (or above) the max price expecting the low price, and it is included at block.timestamp == publicEndTime. 3) Price check uses collectionMintCost; user pays far above the current schedule (or reverts for users sending the end price).

Impact: Users overpay by up to collectionMintCost - collectionEndMintCost per token at the final second; inconsistent pricing.

## [Medium] burnToMint and burnOrSwapExternalToMint skip the salesOption 3 one-mint-per-period limit

File: MinterContract.sol
Function: burnToMint()/burnOrSwapExternalToMint()

The periodic-sale control (tDiff >= 1 and lastMintDate update) is only implemented inside mint(). burnToMint and burnOrSwapExternalToMint mint into _mintCollectionID using getPrice but never check or update lastMintDate, and burnToMint does not even require setMintingCosts. For a collection configured with salesOption 3 that is also a burn/swap target, users can mint any number of tokens per period, and each mint increases getPrice for later regular minters (price depends on viewCirSupply).

Attack path: 1) Admin enables initializeBurn(burnCol, mintCol) or an external swap for a salesOption 3 collection. 2) A user repeatedly calls burnToMint / burnOrSwapExternalToMint in the same period. 3) Multiple tokens are minted in one period, bypassing the intended rate.

Impact: Breaks the one-mint-per-period sale model and its price ladder; allows sniping a large share of a periodic collection.

## [Medium] salesOption 3 schedule uses total circulating supply, so airdrops and missed periods break the period lock

File: MinterContract.sol
Function: mint()/mintAndAuction()

After a period mint, lastMintDate is set to allowlistStartTime + timePeriod * (viewCirSupply(col) - 1). viewCirSupply includes airdropped tokens and mintAndAuction tokens, so any airdrop pushes lastMintDate far into the future and blocks public minting for many periods. On the first mint timeOfLastMint = allowlistStartTime - timePeriod underflows and reverts when allowlistStartTime is 0 or smaller than timePeriod (public-only setup), and mintAndAuction and regular mints share the same lastMintDate slot.

Attack path: 1) Admin airdrops K tokens to the team before a salesOption 3 sale. 2) First public mint sets lastMintDate = start + K periods. 3) All following mints revert with '1 mint/period' for K periods.

Impact: Periodic sale stalls (DoS) for an extended time; collection minting schedule broken.

## [Medium] VRF callbackGasLimit of 40000 is likely too low for fulfillRandomWords

File: RandomizerVRF.sol
Function: fulfillRandomWords()

fulfillRandomWords reads two mappings, makes an external call to gencoreContract.setTokenHash (cold account access, cold SLOADs of randomizerContract and tokenToHash, and a fresh 32-byte SSTORE of ~22.1k gas) and emits an event with a dynamic array. The total is close to or above callbackGasLimit = 40000. Chainlink VRF v2 does not retry a fulfillment that runs out of gas, so the token hash stays zero forever.

Attack path: 1) Users mint on a VRF collection. 2) Coordinator calls rawFulfillRandomWords with 40000 gas. 3) Callback OOGs; tokenToHash remains 0 and tokenURI shows 'pending' permanently.

Impact: Tokens never receive their generative hash; collection art broken unless admin raises the limit before minting.

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

## [Medium] Reentrant mint from onERC721Received bypasses per-wallet public and allowlist caps

File: NextGenCore.sol
Function: mint()

NextGenCore.mint increments collectionCirculationSupply and then calls _mintProcessing, which calls _safeMint(_recipient). ERC721._safeMint invokes onERC721Received on a contract recipient before tokensMintedPerAddress or tokensMintedAllowlistAddress is incremented. The recipient contract can call back into MinterContract.mint from that hook. In the nested call, the checks against viewMaxAllowance and _maxAllowance read the stale pre-call counter, so they pass. The nested mint increments circulation again, so mintIndex stays unique and the global supply cap still holds.

Attack path: A contract wallet with a public-sale or allowlist slot calls MinterContract.mint for one token and sends the price. Its onERC721Received hook calls MinterContract.mint again with the same parameters, and repeats until the supply runs out or it stops. The per-address counter is only written once the outermost call returns.

Impact: One address can take far more tokens than maxCollectionPurchases or its allowlist allowance, up to the entire remaining supply, paying the normal sale price. This breaks allocation fairness; it does not drain the contract balance.

## [Medium] NXT token hash is derived from same-transaction block data, so minters can revert unfavourable mints

File: RandomizerNXT.sol
Function: calculateTokenHash()

calculateTokenHash builds the token hash from blockhash(block.number - 1), randoms.randomNumber() and randoms.randomWord(). In XRandoms.sol both random functions derive from keccak256(block.prevrandao, blockhash(block.number - 1), block.timestamp), so every input is known inside the executing transaction. The hash is written synchronously through gencoreContract.setTokenHash, and retrieveTokenHash and tokenURI can read it within the same call. Nothing is committed in advance and there is no delay before the outcome is visible.

Attack path: A contract calls MinterContract.mint (or burnToMint) for an NXT collection, then reads retrieveTokenHash or the traits derived from it for the new token. If the outcome is not rare, it reverts the whole transaction, so the mint and its payment are undone. Only rare outcomes are kept, at the cost of gas.

Impact: Rarity and trait distribution can be cherry-picked at no economic cost other than gas. Buyers who mint normally get the ordinary distribution, and the sale's trait economics are distorted.

## [Medium] Sales option 3 schedules lastMintDate into the future after pre-sale airdrops, halting public minting

File: MinterContract.sol
Function: mint()

For salesOption 3, after a public mint MinterContract sets lastMintDate[col] = allowlistStartTime + timePeriod * (gencore.viewCirSupply(col) - 1). viewCirSupply counts all tokens already issued, including airdropTokens and mintAndAuction tokens, and those paths do not update lastMintDate. On the next mint, timeOfLastMint is read from lastMintDate and the code computes block.timestamp - timeOfLastMint, which reverts on underflow when the stored date is in the future. The sale therefore stays blocked until the clock passes that scheduled date.

Attack path: No attacker is needed. The admin airdrops N tokens to a collection with salesOption 3 before the public sale. The first public mint sets lastMintDate about N periods ahead of the sale start, and every later mint reverts until that date is reached.

Impact: Public minting for the collection is blocked for roughly N periods after the sale opens, even though supply remains. Buyers pay gas for failed transactions.

## [Medium] Sales option 3 one-mint-per-period limit is defeated by bursts after an idle gap

File: MinterContract.sol
Function: mint()

The period check in MinterContract.mint computes tDiff = (block.timestamp - timeOfLastMint) / timePeriod and requires tDiff >= 1 and _numberOfTokens == 1. The stored lastMintDate is advanced by exactly one timePeriod per minted token, not set to the real mint time. After a gap of K periods, lastMintDate lags real time by many periods, so each of the next K mints passes the check in its own transaction.

Attack path: After a quiet period of K periods, a buyer sends K single-token mint transactions in quick succession. Each one reads the lagging lastMintDate, which has advanced only one period per mint, so tDiff stays at least 1 until the lag is used up.

Impact: The intended pacing of one mint per period is broken after any idle time, letting a bot take a burst of tokens at the start of the next window. The rising price per mint only partly limits this.

## [Medium] claimAuction is all-or-nothing: one failing NFT transfer locks every bidder's refund

File: AuctionDemo.sol
Function: claimAuction()

claimAuction calls IERC721(gencore).safeTransferFrom(ownerOfToken, highestBidder, tokenid) and then makes refund .call transfers to every losing bidder in the same loop, with no pull-payment fallback. If the highest bidder is a contract whose onERC721Received reverts, or if the seller never approved AuctionDemo for the token, the transfer reverts and the whole transaction rolls back. cancelBid and cancelAllBids require block.timestamp <= auctionEnd, while claimAuction requires >=, so no bidder can withdraw after the auction ends.

Attack path: A bidder places the highest bid from a contract that rejects ERC721 receipt, or the token owner leaves the NFT unapproved. Every later claimAuction call by the winner or the admin reverts, so no refund and no seller payout can happen and the bids stay in the contract.

Impact: All escrowed ETH for this auction, including other bidders' refunds and the seller's proceeds, is locked permanently. The griefing bidder also loses access to its own bid, so the attack costs it the bid amount.

## [Medium] NextGenCore.burnToMint mints to the current owner before burning, so a callback can move the token being burned

File: NextGenCore.sol
Function: burnToMint()

burnToMint calls _mintProcessing(mintIndex, ownerOf(_tokenId), ...) before _burn(_tokenId). _mintProcessing calls _safeMint, which invokes onERC721Received on the owner if it is a contract. During that callback the owner still holds _tokenId, so it can transfer the token to another address. _burn(_tokenId) then destroys the token from whoever holds it at that moment, and burnAmount is incremented.

Attack path: A contract owner calls MinterContract.burnToMint for token X. In the onERC721Received callback it transfers X to a buyer, who may have paid for it. The burn then removes X from the buyer, while the seller keeps the newly minted token.

Impact: A buyer can lose a token it bought and that is burned without its consent. The seller gets both the sale payment and the new mint. The token-holder protection that burn-to-mint should give is broken.

## [Medium] Auction bidding and claiming disagree at block.timestamp == auctionEnd

File: AuctionDemo.sol
Function: claimAuction()

participateToAuction, cancelBid and cancelAllBids accept block.timestamp <= minter.getAuctionEndTime, while claimAuction requires block.timestamp >= auctionEnd, so both conditions hold at exactly the end second. claimAuction refunds losing bids with .call without setting status = false first, and cancelBid does not check auctionClaim. A refunded bidder's receive hook can therefore call cancelBid in the same transaction and receive the same bid again. Separately, a bid accepted at the same second after auctionClaim is already true can never be refunded.

Attack path: The winner or admin calls claimAuction in a block whose timestamp equals auctionEnd exactly. A losing bidder's receive hook calls cancelBid for its bid during the refund .call, and the bid is paid out a second time from the contract balance, which also holds other auctions' ETH. Alternatively, a bid is placed in that same second after the claim and is locked.

Impact: In the exact-second case the contract can pay one bidder twice from escrow, which can drain funds belonging to other auctions. The precondition is narrow and depends on claim timing.

## [Medium] payArtist uses current artist split against stored accepted addresses, so accepted payouts can exceed the collection balance

File: MinterContract.sol
Function: payArtist()

proposePrimaryAddressesAndPercentages checks that add1+add2+add3 equals the artistPercentage at proposal time. setPrimaryAndSecondarySplits can later change collectionRoyaltiesPrimarySplits.artistPercentage, and it does not reset collectionArtistPrimaryAddresses.status. payArtist then requires artistPercentage + _teamperc1 + _teamperc2 == 100 using the new artistPercentage, while the artist payouts use the stored add percentages that still sum to the old value. The total paid can therefore differ from collectionTotalAmount.

Attack path: After splits are accepted, a function admin lowers artistPercentage through setPrimaryAndSecondarySplits without re-proposing or re-accepting the artist addresses. A later payArtist call then pays out more than this collection's balance, and the shortfall is taken from other collections' ETH held by the same contract, while failed .call transfers are silently ignored.

Impact: Accounting across collections breaks, and some payouts can fail silently and stay in the contract. The trigger is an admin configuration path, but the invariant is enforced nowhere on-chain.

## [Medium] External burn-or-swap allowlist leaf omits the external collection, so a proof can be reused across collections

File: MinterContract.sol
Function: burnOrSwapExternalToMint()

In the allowlist phase, burnOrSwapExternalToMint verifies a Merkle proof against collectionPhases[col].merkleRoot using the leaf keccak256(abi.encodePacked(_tokenId, tokData)). The leaf does not include _erc721Collection or _burnCollectionID, although externalCol is derived from both. Every external collection registered for the same mint collection shares one root, and token ids overlap across collections.

Attack path: The admin registers two external collections, A and B, for the same mint collection with overlapping id ranges. A holder of B token #5 uses the public proof that was issued for A token #5 with the same tokData, and mints without holding that A token.

Impact: Allowlist eligibility intended for holders of one collection can be claimed by holders of another. The impact depends on the admin registering several external collections for one mint collection.

## [Medium] Randomizer swap leaves in-flight VRF requests unable to write their hash

File: RandomizerVRF.sol
Function: fulfillRandomWords()

fulfillRandomWords calls gencoreContract.setTokenHash, and NextGenCore.setTokenHash requires msg.sender == collectionAdditionalData[_collectionID].randomizerContract. addRandomizer and updateCoreContract can replace the randomizer for a collection while requests are pending. The old randomizer's callback then reverts at setTokenHash, and no path in the core re-requests a randomness for a token.

Attack path: A minted token's VRF request is pending. The admin calls addRandomizer with a new randomizer, and when the old request is fulfilled its callback reverts at the msg.sender check in setTokenHash.

Impact: Affected tokens keep a zero tokenToHash and show pending metadata permanently, with no admin recovery path in the core contract.

## [Medium] updateCollectionInfo changes collection script and metadata after the artist has signed

File: NextGenCore.sol
Function: updateCollectionInfo()

artistSignature sets artistSigned[_collectionID] = true, and setCollectionData uses that flag to restrict later changes. updateCollectionInfo only requires that the collection exists and collectionFreeze is false, and never checks artistSigned. A collection admin can therefore replace collectionScript, collectionLibrary and the metadata text after the artist has signed, until the collection is frozen.

Attack path: The artist signs the collection data. A collection admin calls updateCollectionInfo with _index 1000 and a new collectionScript, and every subsequent token's tokenURI renders the changed generative script.

Impact: The signature no longer binds the artwork that buyers mint. This may be an intended admin power, but the signature is not enforced on-chain.

## [Medium] NextGenCore.mint pays the receiver callback before incrementing per-address counters, so Minter caps can be reentered past

File: NextGenCore.sol
Function: mint()

NextGenCore.mint() calls _mintProcessing(), which calls _safeMint(). In ERC721.sol _safeMint first runs _mint and then _checkOnERC721Received on the recipient, so the recipient contract gets control while the caller's counter is still unchanged. Only after that returns does mint() increment tokensMintedAllowlistAddress or tokensMintedPerAddress for _mintingAddress. MinterContract.mint() checks retrieveTokensMintedPublicPerAddress(col, msg.sender) + _numberOfTokens <= viewMaxAllowance, and for the allowlist checks _maxAllowance >= minted + _numberOfTokens, both before its mint loop, and it has no reentrancy guard. The caller chooses _mintTo, so it can pass its own address as recipient.

Attack path: 1. Deploy a contract with onERC721Received that calls NextGenMinterContract.mint(collectionId, 1, maxAllowance, data, self, proof, 0, salt) for a public-phase drop, with msg.value equal to the price. 2. Inside the receive callback, call Minter.mint again with the same arguments. Each nested call reads a counter of zero and passes the check. 3. Nesting continues until supply or gas runs out. The counters are incremented only as the frames unwind, so the cap is never seen as reached within the transaction. 4. The contract ends up holding more tokens than maxCollectionPurchases or _maxAllowance, paying the price for each one.

Impact: Per-wallet public caps and allowlist allowances are not enforced. One wallet can take an entire drop in one transaction, which defeats the distribution the sales model is built for. The attacker still pays the sale price, so the harm is to fair distribution rather than direct theft of funds.

## [Medium] AuctionDemo.claimAuction pays the highest bid to the auction contract owner instead of the token owner

File: AuctionDemo.sol
Function: claimAuction()

claimAuction() reads ownerOfToken = IERC721(gencore).ownerOf(_tokenid) and then, for the winning bid, transfers the token to the highest bidder. The sale proceeds are sent with payable(owner()).call{value: highestBid}, where owner() is the Ownable owner of the auctionDemo contract (the deployer) and not ownerOfToken. The scope README (Main invariants, line 184) states that the owner of the token receives the funds of the highest bid. The code therefore routes seller proceeds to the deployer address, and the ClaimAuction event reports that address as the recipient.

Attack path: 1. A token is put up through Minter.mintAndAuction, so its ownerOf is the recipient of the mint. 2. A bidder wins the auction. 3. The winner or an admin calls claimAuction. 4. The winning bid is sent to auctionDemo.owner() and the token holder receives nothing from the sale.

Impact: Every auction's proceeds go to the deployer address instead of the token owner. Either proceeds are silently taken by the contract owner, or the contract does not do what the documented invariant says. In both cases the seller gets nothing.

## [High] A failing NFT transfer inside claimAuction reverts the whole claim, and no path refunds escrowed bids afterwards

File: AuctionDemo.sol
Function: claimAuction()

claimAuction() is the only function that refunds losing bidders after the auction ends, because cancelBid and cancelAllBids require block.timestamp <= endTime. Inside the loop, the winning bid runs IERC721(gencore).safeTransferFrom(ownerOfToken, highestBidder, _tokenid). That call reverts if the auction contract is not approved by the token owner that is current at claim time, if the token was transferred or burned after bidding, or if the winner is a contract without an onERC721Received hook. A revert rolls back the entire claim, including the refunds, so retrying cannot succeed while the condition holds. The contract has no withdraw or rescue function. The unbounded bid array (cancelled bids stay in it) also lets the refund loop grow past the block gas limit, which would have the same effect.

Attack path: 1. Bidders place bids on a token. 2. Before the end time the token holder transfers or sells the token, or revokes approval for the auction contract. The same happens if the winner is a contract without a receiver hook. 3. After the end time the winner or admin calls claimAuction and the transfer reverts. 4. cancelBid and cancelAllBids revert because the end time has passed, and no other function moves the escrowed ETH, so every bid stays locked.

Impact: Escrowed bids from all bidders on that token stay locked permanently. The trigger is a normal action by the token holder (for example, selling the NFT on a marketplace), so it does not need an attacker.

## [Medium] RandomizerNXT computes the token hash inside the mint transaction, so a caller can revert until a wanted trait appears

File: RandomizerNXT.sol
Function: calculateTokenHash()

calculateTokenHash() computes keccak256(mintIndex, blockhash(block.number - 1), randoms.randomNumber(), randoms.randomWord()) and writes it at once through gencoreContract.setTokenHash, all within the mint transaction. randomNumber() and randomWord() in randomPool depend only on block.prevrandao, blockhash(block.number - 1) and block.timestamp, so every input is known to the caller before the transaction is sent. The _saltfun_o argument is accepted and not used. NextGenCore.retrieveTokenHash is public, so a contract that calls Minter.mint can read the hash for the index it received and revert the whole transaction when the result is not wanted.

Attack path: 1. Deploy a contract that calls NextGenMinterContract.mint in the public phase and then reads NextGenCore.retrieveTokenHash(expectedMintIndex). 2. Revert unless the hash has the wanted trait. 3. Repeat by simulation (eth_call) or by reverted transactions until the hash matches, then submit the successful call and keep the rare token.

Impact: Buyers can select rare generative traits at the sale price, while honest buyers get random ones. The scope README does not disclaim this, and it is a common rarity-manipulation primitive for on-chain generative drops.

## [Medium] burnOrSwapExternalToMint allowlist leaf omits the external collection address, so a proof for one collection works for another

File: MinterContract.sol
Function: burnOrSwapExternalToMint()

In the allowlist branch, burnOrSwapExternalToMint() verifies the Merkle proof against the mint collection root using the leaf keccak256(abi.encodePacked(_tokenId, tokData)). The leaf does not include _erc721Collection or _burnCollectionID, although several external collections can be configured for the same mint collection through initializeExternalBurnOrSwap. When the token ids overlap and the tokData strings match, the leaves are identical across those collections, so a holder of collection B's token k can use a proof built for collection A's token k.

Attack path: 1. The admin configures collections A and B as burn-or-swap sources for mint collection M and includes A's token k in the allowlist tree for M. 2. A holder of B's token k, who is not on the list for B, calls burnOrSwapExternalToMint with _erc721Collection = B, _tokenId = k and A's proof with the same tokData. 3. The proof verifies, B's token is transferred to the swap address, and the holder mints in M.

Impact: Holders of an unlisted collection can get allowlist-gated mints, which violates the allowlist invariant. The impact depends on how the external collections and token ranges were configured.

## [Medium] burnToMint and burnOrSwapExternalToMint skip the salesOption-3 period rule and the public per-wallet cap

File: MinterContract.sol
Function: burnToMint()

mint() enforces the periodic sale model (salesOption 3: tDiff >= 1 and _numberOfTokens == 1, and it updates lastMintDate) and the public cap via maxCollectionPurchases. burnToMint() checks only the burn-to-mint allow flag and the public time window, then calls gencore.burnToMint without the period check, without updating lastMintDate and without any per-address count. burnOrSwapExternalToMint() has the same gap in its public branch. The price still follows getPrice, so the cost rises but the pacing and cap are not enforced.

Attack path: 1. The admin enables burnToMintCollections[A][M] for a periodic-sale collection M and M's public window is open. 2. A holder burns several eligible tokens from A, one per call, in the same block, paying getPrice each time. 3. Each call mints one token in M without a period check and without counting toward the public per-wallet cap.

Impact: The release pacing of a periodic-sale collection and the public per-wallet cap can both be exceeded through the burn paths. The scope README lists both as attack ideas (more than one token per period, and public-phase cap).

## [Medium] Auction cancel and claim both accept block.timestamp == endTime, which allows a double refund from the pooled balance

File: AuctionDemo.sol
Function: cancelBid()

claimAuction() requires block.timestamp >= endTime, while cancelBid(), cancelAllBids() and participateToAuction() require block.timestamp <= endTime, so all of them are valid at exactly endTime. claimAuction() refunds each active losing bid with a call but never sets its status to false, and cancelBid() does not check auctionClaim. In a block whose timestamp equals endTime, a losing bidder can be refunded by the claim and then refunded again by cancelBid. The winner who cancels after the claim also receives the bid back. A participateToAuction call after the claim is accepted and never refunded. All payouts come from one pooled balance of the contract, so the extra payment is taken from other auctions' escrow.

Attack path: 1. The auction endTime equals the timestamp of some block, which happens for about one slot in twelve. 2. In that block the claimer's claimAuction transaction is ordered before the bidder's cancelBid transaction. 3. The bidder gets the bid back twice, and the excess is paid from the escrow of other tokens.

Impact: Overpayment from shared escrow, which can take other auctions' bids. The window is a single block whose timestamp equals endTime, so the realistic likelihood is low.

## [Medium] addRandomizer has no freeze check, so a frozen collection can receive a new randomizer for its future mints

File: NextGenCore.sol
Function: addRandomizer()

setCollectionData(), updateCollectionInfo(), changeMetadataView() and changeTokenData() all check collectionFreeze, and the README's main invariants say a frozen collection's data cannot be altered. addRandomizer() only checks IRandomizer(_randomizerContract).isRandomizerContract() and then writes collectionAdditionalData[_collectionID].randomizerContract and .randomizer, with no freeze check. The randomizer produces every later token hash through setTokenHash, so it is part of the collection's generative data.

Attack path: 1. The collection is frozen by freezeCollection. 2. A function admin, or whoever holds that key, calls addRandomizer(collection, maliciousRandomizer). The contract passes isRandomizerContract because it returns true. 3. The next mint calls maliciousRandomizer.calculateTokenHash, which writes any hash for the new index through setTokenHash.

Impact: Freezing does not stop changes to the randomness of tokens minted after the freeze. Exposure depends on trust in the admin set, but it breaks the stated freeze invariant.

## [Medium] Replacing the randomizer while a VRF request is pending leaves that token without a hash permanently

File: RandomizerVRF.sol
Function: fulfillRandomWords()

fulfillRandomWords() calls gencoreContract.setTokenHash(...). NextGenCore.setTokenHash() requires msg.sender == collectionAdditionalData[collectionID].randomizerContract at fulfillment time. addRandomizer() can replace that address at any time, with no check for pending requests. If the admin switches the randomizer between requestRandomWords() and the coordinator callback, the old contract's callback reverts and tokenToHash stays zero, so tokenURI keeps returning pending. RandomizerVRF has no retry or reset function, and the coordinator does not re-deliver a fulfilled request.

Attack path: 1. A token is minted through RandomizerVRF and its request is pending. 2. The admin calls NextGenCore.addRandomizer with a different randomizer. 3. The coordinator delivers the old request, and setTokenHash reverts on the msg.sender check. 4. The token has no hash. No function in either contract can request it again, and the old randomizer cannot re-deliver it.

Impact: Affected tokens stay pending forever, with no generative script, and the metadata shows pending. This needs an admin action, so it is an operational liveness risk.

## [Medium] Function-admin grants are keyed by selector only, so a grant for one contract works on every contract with the same selector

File: NextGenAdmins.sol
Function: registerFunctionAdmin()

NextGenAdmins stores functionAdmin[address][bytes4] with no contract address. NextGenCore, NextGenMinterContract, RandomizerVRF and RandomizerRNG all check retrieveFunctionAdmin(msg.sender, selector) against the same Admins contract. updateAdminContract(address) exists in Core, Minter, RandomizerVRF and RandomizerRNG with the same selector, so a grant meant to maintain one randomizer also authorizes updateAdminContract on Core. That call can repoint Core's admin reference to an attacker-controlled contract whose retrieveGlobalAdmin returns true.

Attack path: 1. A global admin grants a function admin the updateAdminContract selector so that person can maintain RandomizerRNG. 2. That function admin calls NextGenCore.updateAdminContract(maliciousAdmins). Core's FunctionAdminRequired passes because retrieveFunctionAdmin(msg.sender, selector) is true for the shared selector. 3. The malicious admins contract returns true for every role, which gives the attacker control over Core, Minter and the randomizers.

Impact: A narrow grant becomes control of the whole protocol. A global admin has to make the narrow grant first, so this is an escalation path rather than an open exploit.

## [Medium] mint(): reentrant _safeMint callback bypasses per-wallet allowlist and public caps

File: MinterContract.sol
Function: mint()

mint() calls gencore.mint() inside a loop. NextGenCore.mint() calls _mintProcessing(), which calls _safeMint(_mintTo, ...). The OpenZeppelin-style _safeMint in ERC721.sol hands control to onERC721Received on a contract recipient before it returns. The per-wallet counters tokensMintedAllowlistAddress and tokensMintedPerAddress are only incremented after _mintProcessing returns, inside NextGenCore.mint(). The allowance checks in MinterContract.mint() (_maxAllowance against retrieveTokensMintedALPerAddress, and viewMaxAllowance against retrieveTokensMintedPublicPerAddress) read those counters before the loop starts. Neither mint() nor burnOrSwapExternalToMint() is nonReentrant.

Attack path: A wallet that is allowed one allowlist token, or one public token under the cap, deploys a contract that implements onERC721Received. It calls mint() with msg.sender set to itself and _mintTo set to the same contract, and pays the price per token. During the callback of the first token it calls mint() again. The counter still holds the old value, so the cap check passes. This nests, so the wallet collects more tokens than its cap, paying the current price for each.

Impact: Per-wallet allocations and public purchase caps are not enforced. One wallet can take many allowlist slots in bulk, which breaks the fairness the allowlist was meant to provide. The attacker pays the full price, so the loss is an allocation breach rather than theft of ETH.

## [Medium] RandomizerNXT: same-transaction hash lets buyers revert until a rare token is minted

File: RandomizerNXT.sol
Function: calculateTokenHash()

calculateTokenHash() derives the token hash from keccak256 of mintIndex, blockhash(block.number - 1), randoms.randomNumber() and randoms.randomWord(). XRandoms builds those values from block.prevrandao, blockhash(block.number - 1) and block.timestamp, so every input is fixed for the whole block and readable by any caller in the same transaction. The hash is written to core through setTokenHash() during the mint itself, because NextGenCore._mintProcessing() calls calculateTokenHash() before _safeMint(). A recipient contract's onERC721Received hook can therefore read retrieveTokenHash() and revert when the hash is unwanted. The user-supplied _saltfun_o parameter is not part of the hash at all.

Attack path: A buyer deploys a receiver contract and calls the minter with _mintTo set to that contract. In onERC721Received it reads the new token's hash and reverts if the rarity is below the buyer's target, which returns the ETH. The buyer retries in a later block, when the block-derived inputs change. Only a favourable mint is kept. Within one block the mint index and hash do not change, so the retry has to wait for the next block.

Impact: A buyer who automates this can select rare traits for the cost of gas on failed attempts, so the rarity distribution is not random for that buyer class. The impact is fairness and rarity integrity of the collection. It is not a theft of funds.

## [Medium] sales option 3: schedule-anchored lastMintDate allows a burst of mints after idle periods

File: MinterContract.sol
Function: mint()

For salesOption 3, mint() requires tDiff = (block.timestamp - timeOfLastMint) / timePeriod to be at least 1, and then sets lastMintDate to allowlistStartTime + timePeriod * (viewCirSupply - 1). That stored value is a schedule point, not the block timestamp. If buyers do not mint for several periods, lastMintDate stays behind real time, so after each mint the next call still satisfies tDiff >= 1 until the anchor catches up. The per-transaction check only sees the anchor and does not count the mints already made in the current period.

Attack path: Early in the sale nobody mints for k periods. A buyer then sends k consecutive mint transactions of one token each, or chains them within one block. Each passes tDiff >= 1 because the anchor advances by only one period per mint. The buyer obtains k tokens in one burst, each at the rising option-3 price.

Impact: The documented one-mint-per-period rule is broken. One buyer or bot can take a whole backlog of tokens in a single block, which defeats the pacing purpose of the sale. The price rises with circulation, so the damage is to pacing and fairness rather than a direct loss of ETH.

## [Medium] AuctionDemo: no escrow, so the token owner can freeze all bids by moving or unapproving the token

File: AuctionDemo.sol
Function: claimAuction()

participateToAuction() accepts bids in ETH and stores them, but the auctioned token is never escrowed in the contract. claimAuction() is the only path that refunds losing bidders after the end time. It reads ownerOfToken = IERC721(gencore).ownerOf(_tokenid) at claim time and then calls safeTransferFrom(ownerOfToken, highestBidder, _tokenid), which requires the auction contract to be approved by that current owner. cancelBid and cancelAllBids only work while block.timestamp <= end. If the current owner transfers the token to an address that has not approved the auction, or revokes the approval, every claimAuction call reverts.

Attack path: The seller, who received the token from mintAndAuction, lets bids accumulate. After the end time the seller transfers the token to a fresh address that has not approved the auction, or revokes the approval. Every later claimAuction call then reverts because the transfer from the current owner fails. The bidders' ETH remains in the contract, and AuctionDemo has no withdrawal function to recover it.

Impact: All bid ETH for that token is locked permanently. A malicious or careless seller can grief the auction, and no bidder can recover funds through the contract.

## [Medium] AuctionDemo: unbounded bid array lets a griefer push claimAuction past the block gas limit

File: AuctionDemo.sol
Function: participateToAuction()

auctionInfoData[_tokenid] is an append-only array. participateToAuction() pushes a new entry and calls returnHighestBid(), which loops over the whole array. returnHighestBidder() loops over it as well, and claimAuction() calls both functions and then runs a full loop that makes an external ETH call for every active entry. Cancelled entries stay in the array with status false and are never removed, so the array length only grows. Each new bid must strictly exceed the current highest active bid, so a series of small, increasing bids keeps the ETH cost low.

Attack path: A griefer places many small increasing bids from one or more wallets and cancels most of them, leaving the array in the thousands. Every later participateToAuction call iterates the whole array, and claimAuction eventually exceeds the block gas limit. The winner cannot be settled and no refunds are paid.

Impact: Settlement and refunds for that auction can be made impossible for the cost of gas and small ETH amounts, which locks the token and every bid in the auction.

## [Medium] NextGenAdmins: function permissions are keyed by selector only, so grants apply across contracts

File: NextGenAdmins.sol
Function: registerFunctionAdmin()

functionAdmin is a mapping keyed by (address, bytes4 selector) with no contract address component. Every contract that points at this admins instance (NextGenCore, NextGenMinterContract, the three randomizers, and AuctionDemo) checks it with this.<fn>.selector. Selectors such as updateCoreContract(address), updateAdminContract(address) and emergencyWithdraw() exist in several of these contracts, so one grant resolves to the same permission bit everywhere. Granting a function admin for one contract's selector therefore grants it for all of them.

Attack path: The owner gives a maintenance operator the updateCoreContract permission so they can rotate the core pointer of one randomizer. The same grant passes the FunctionAdminRequired check in NextGenMinterContract.updateCoreContract, so the operator can repoint the minter to a core contract they control. The artist lookup used by the ArtistOrAdminRequired modifier then comes from that contract. The same applies to emergencyWithdraw on the minter and randomizers.

Impact: Permissions intended for one contract leak to every other contract that shares the admins instance. This is a least-privilege failure rather than an outsider's theft, since only parties that already hold a function-admin grant can exploit it.

## [Medium] setPrimaryAndSecondarySplits changes split after acceptance; payArtist can pay out over 100 percent

File: MinterContract.sol
Function: setPrimaryAndSecondarySplits()

proposePrimaryAddressesAndPercentages() checks that add1 + add2 + add3 equals collectionRoyaltiesPrimarySplits.artistPercentage at proposal time, and acceptAddressesAndPercentages() sets status to true. setPrimaryAndSecondarySplits() later overwrites artistPercentage and teamPercentage without resetting collectionArtistPrimaryAddresses[...].status or the stored add percentages. payArtist() then requires artistPercentage + _teamperc1 + _teamperc2 == 100 using the new artistPercentage, but pays the artist's add1..add3 shares, which were computed against the old artistPercentage.

Attack path: An admin accepts an artist's proposal with artist share 50. The admin later lowers the artist share to 40 through setPrimaryAndSecondarySplits, and the accepted addresses stay active. payArtist then accepts team percentages summing to 60, which passes its check, but the artist shares still sum to 50. The total paid is 110 percent of the collection balance.

Impact: When the artist share is lowered after acceptance, payArtist pays out more than the collection's balance, and the excess comes from ETH that belongs to other collections in the same contract. When the share is raised, the difference is stranded in the contract. The trigger is an admin action, but the invariant is enforced nowhere.

## [Medium] AuctionDemo: winning bid is paid to the contract owner, not to the token seller

File: AuctionDemo.sol
Function: claimAuction()

On a successful claim the winning amount is sent with payable(owner()).call, where owner() is the Ownable owner of the auction contract. The token itself is transferred from the current holder, which is the account that received it in mintAndAuction. The token holder never receives the sale proceeds, and nothing in the contract records a seller or a revenue split.

Attack path: No attacker is needed; this is the payout path for every settled auction. The operator collects every winning bid, while the holder who gave up the token receives nothing.

Impact: If the intended model is that the artist or seller receives the sale, all proceeds go to the operator address instead. If it is meant as platform revenue, the design is undocumented in the code. Either way the payout recipient does not match a seller-token model.

## [Medium] payArtist: failed payouts are not retried and the collection balance is zeroed first

File: MinterContract.sol
Function: payArtist()

payArtist() sets collectionTotalAmount[_collectionID] = 0 before the five payout calls. Each payout uses a low-level call with value and ignores the revert case, emitting success as false in the event only. The unpaid amount is neither restored to collectionTotalAmount nor queued for pull withdrawal. Rounding dust from royalties * pct / 100 is also not credited to anyone.

Attack path: An artist or team address that is a contract rejecting ETH makes its call fail. The corresponding share stays in the contract balance with no accounting entry. A zero address configured by mistake does not fail, but the ETH is sent to address zero and burned. Recovery is only possible through emergencyWithdraw, which sends the whole contract balance, including other collections' funds, to the admin owner.

Impact: Artist or team shares that fail to send are stranded, and recovery needs the admin path that also moves other collections' ETH. This is a real loss of funds owed to the affected recipient, though it depends on how recipients are configured.

## [Medium] RandomizerVRF: callback gas limit of 40000 may be too low, leaving token hashes pending forever

File: RandomizerVRF.sol
Function: fulfillRandomWords()

callbackGasLimit defaults to a constant 40000. fulfillRandomWords() makes an external call into NextGenCore.setTokenHash(), which reads randomizerContract and tokenToHash (cold SLOADs), writes tokenToHash (a fresh SSTORE), and the randomizer emits an event. This was estimated by hand, not measured. The VRF request is one-shot, and nothing clears or retries tokenToRequest and requestToToken for a token whose callback failed. If the callback runs out of gas, the token hash stays zero and tokenURI keeps returning the pending value.

Attack path: No attacker is needed. A normal VRF fulfillment may exceed the gas limit under some storage or calldata conditions, after which the hash is never written for that token.

Impact: Those tokens remain in the pending state with no hash, so their generative output never appears. Whether this happens depends on the real gas cost, which was not measured here, so confidence is low.
