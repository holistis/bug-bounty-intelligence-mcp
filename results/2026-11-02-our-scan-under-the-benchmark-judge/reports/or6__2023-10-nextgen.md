# Audit report

## [High] Reentrancy via _safeMint callback bypasses per-address mint limits (public max and allowlist)

File: NextGenCore.sol
Function: mint() / _mintProcessing()

NextGenCore.mint calls _mintProcessing, which calls _safeMint and so the recipient's onERC721Received hook. Only after that does it update tokensMintedPerAddress or tokensMintedAllowlistAddress. MinterContract.mint reads those counters (retrieveTokensMintedPublicPerAddress / retrieveTokensMintedALPerAddress) in its Max and AL-limit checks before minting. In the hook, a contract recipient (_mintTo) can call MinterContract.mint again and see the stale counters, so each nested call passes the limit check. The outer loop in MinterContract.mint also pre-validated supply only once. Nested mints can use up the supply, after which later outer iterations increment collectionCirculationSupply in Core without minting anything.

Attack path: 1) An attacker deploys a contract that implements onERC721Received and passes it as _mintTo. 2) In the public or allowlist phase it calls mint with _numberOfTokens equal to the limit. 3) Inside the callback of the first token it calls mint again, which passes the Max or AL limit check because the counters are not yet incremented. 4) It repeats recursively to mint far more than maxCollectionPurchases or _maxAllowance, paying the price each time.

Impact: The per-wallet public cap and the allowlist allowance can be bypassed without limit, so one actor can take a large share of a collection's supply. The same flaw can desynchronise circulation supply from tokens actually minted.

## [High] Auction: claimAuction and cancelBid both valid at timestamp == end, allowing double refund of bids

File: AuctionDemo.sol
Function: claimAuction() / cancelBid()

cancelBid requires block.timestamp <= getAuctionEndTime and claimAuction requires block.timestamp >= getAuctionEndTime, so both are callable when timestamp equals the end time. claimAuction refunds every losing bid with an external call but never sets auctionInfoData[..].status = false for refunded or paid entries. A losing bidder can therefore call cancelBid for the same index and be paid a second time out of other bidders' funds. A losing bidder that is a contract can do this from the refund callback of claimAuction. A bidder can also do it in a later transaction in the same block.

Attack path: 1) The attacker places a losing bid from a contract. 2) The winner or an admin calls claimAuction in a block whose timestamp equals the auction end. 3) The refund call triggers the attacker's receive(), which calls cancelBid(tokenid, index). The check passes (timestamp <= end, status still true) and the bid is refunded again. 4) The auction contract's balance, which holds other bidders' funds including the winning bid, is drained.

Impact: The auction contract loses ETH belonging to other bidders. The winner's payment to the owner can fail, or other refunds can fail, because the balance is insufficient.

## [Medium] Auction settlement can be permanently blocked (unbounded loop / reverting NFT receiver), locking all bids

File: AuctionDemo.sol
Function: claimAuction() / participateToAuction()

claimAuction loops over all entries of auctionInfoData[_tokenid]. returnHighestBid and returnHighestBidder, which it also calls, loop over the same array. Bids only have to exceed the previous highest bid, so an attacker can push a very large number of bids with tiny increments until the settlement loop exceeds the block gas limit. Separately, the winning bidder is paid via IERC721.safeTransferFrom, so a highest bidder that is a contract rejecting ERC721 receipts makes claimAuction revert for everyone. cancelBid and cancelAllBids are disabled after the end time, and there is no other withdrawal path.

Attack path: 1) The attacker places a bid from a contract whose onERC721Received reverts, or spams thousands of increasing bids. 2) The auction ends. 3) Every claimAuction call by the winner or an admin reverts (out of gas or revert). 4) Because cancelling is only allowed up to the end time, all bids stay locked in the contract.

Impact: The NFT cannot be transferred and all bidders' ETH is locked permanently. The attacker risks only their own locked bid, or the gas for the spam bids.

## [Medium] NXT randomizer hash is predictable and can be gamed by contract minters

File: RandomizerNXT.sol
Function: calculateTokenHash()

The token hash is keccak256(mintIndex, blockhash(block.number-1), randoms.randomNumber(), randoms.randomWord()). randomPool derives its numbers from block.prevrandao, blockhash(block.number-1) and block.timestamp. All of these inputs are known to the caller inside the same transaction, and mintIndex is predictable. A minting contract can therefore compute the resulting hash, and thus the generative output, before or while minting.

Attack path: 1) The attacker mints through a contract. 2) After the mint, the contract reads retrieveTokenHash (or recomputes it). 3) If the trait is undesirable, the contract reverts the whole transaction. 4) It repeats until a rare trait appears, then keeps the token.

Impact: Rare outputs of a generative collection can be cherry-picked at no extra cost, which undermines fairness.

## [Medium] VRF randomizer callbackGasLimit of 40000 is too low for fulfillRandomWords

File: RandomizerVRF.sol
Function: fulfillRandomWords()

callbackGasLimit defaults to 40000. fulfillRandomWords makes several cold storage reads (requestToToken twice, tokenIdToCollection, gencoreContract). It then makes an external call to NextGenCore.setTokenHash, which reads the randomizer address and tokenToHash and then does a fresh SSTORE (about 22k gas). It also emits an event. This likely exceeds 40000 gas. If the callback runs out of gas, Chainlink does not retry it.

Attack path: 1) A token is minted with the VRF randomizer. 2) The coordinator calls fulfillRandomWords with a 40000 gas limit. 3) The callback runs out of gas and nobody can set the hash, because setTokenHash is callable only by the randomizer.

Impact: tokenToHash stays zero forever and the token is stuck as 'pending' or without randomness, so affected collection tokens cannot be revealed.

## [Medium] payArtist zeroes collectionTotalAmount and ignores failed transfers, stranding funds

File: MinterContract.sol
Function: payArtist()

payArtist sets collectionTotalAmount[_collectionID]=0 before paying. It then makes five low-level calls and only emits events with the success flags, never reverting or restoring the owed amount. If any recipient (artist address, team address) reverts or is an incompatible contract, its share stays in the minter with no accounting entry and cannot be paid again through payArtist. The only way out is emergencyWithdraw, which sends the whole balance to adminsContract.owner(), not to the intended recipient. Rounding dust from /100 also stays in the contract.

Attack path: 1) A recipient address is a contract that reverts on receive. 2) An admin calls payArtist. 3) That recipient's call fails, the counter is already 0, and a second payArtist call reverts with 'Collection Balance must be grater than 0'.

Impact: Artist or team funds can be stuck, and are redirected to the admin owner if recovered through emergencyWithdraw.

## [Medium] RNG randomizer reverts all mints unless pre-funded with ETH

File: RandomizerRNG.sol
Function: calculateTokenHash() / requestRandomWords()

calculateTokenHash calls arrngController.requestRandomWords{value: ethRequired}, paying from the randomizer's own balance. ethRequired defaults to 0 and is only changed by updateRNGCost. If the balance is too low, or the fee is non-zero and unfunded, the external call reverts. The revert propagates through NextGenCore._mintProcessing, so every mint, airdrop and burnToMint on collections using this randomizer reverts.

Attack path: The collection is configured with this randomizer. The contract balance falls below the required fee, or the fee changes on the arRNG side. All mint attempts then revert until an admin tops up or reconfigures.

Impact: Minting is blocked (a denial of service) until ETH is deposited and the cost is correct.
