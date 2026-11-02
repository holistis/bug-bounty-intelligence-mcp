# Audit report

## [High] emergencyWithdraw lets anyone drain any token via unchecked underflow of balances

File: StablecoinDEX.sol
Function: emergencyWithdraw() / _processWithdrawal()

emergencyWithdraw is external and calls _processWithdrawal(msg.sender, token, amount). That function subtracts `amount` from balances[user][token] and totalDeposits[token] inside an `unchecked` block. It never checks that the caller's balance covers `amount`, and it has no emergency or role gate. A caller with a zero balance therefore wraps balances[msg.sender][token] to about 2^128 - amount. After that, safeTransfer sends `amount` real tokens out of the contract. totalDeposits also wraps, so the accounting is corrupted as well.

Attack path: 1. The attacker calls emergencyWithdraw(token, X) with no deposit, where X is the contract's full token balance. 2. The unchecked subtraction wraps and the contract transfers X tokens to the attacker. 3. The attacker's internal balance is now huge. They can repeat for every token held, or use that balance as a taker in fillOrder to take other tokens from makers.

Impact: Complete theft of all deposited funds of every token in the DEX, plus permanent corruption of balances and totalDeposits.

## [Medium] cancel() has no maker authorization: anyone can cancel any order

File: StablecoinDEX.sol
Function: cancel()

cancel(orderId) only checks that order.maker != address(0) and then calls _cancelOrder. It never compares msg.sender with order.maker. Anyone can therefore remove any maker's resting order from the book. The refund goes to the maker's internal balance, so funds are not stolen, but the maker loses control of its own orders. The docs describe this function as the way for makers to adjust positions.

Attack path: 1. The attacker reads orderHeads and getOrders to list all open order IDs. 2. The attacker calls cancel(id) for each one, or front-runs a taker's fillOrder with cancel. 3. Every order is removed and the book is emptied.

Impact: Anyone can wipe the whole orderbook and front-run fills at will. This is a cheap denial of service against market making and payment settlement. The griefing attacker loses nothing.

## [Medium] withdraw() sends tokens before debiting balance, enabling reentrancy with hook tokens

File: StablecoinDEX.sol
Function: withdraw()

withdraw() checks balances[msg.sender][token] >= amount, then calls safeTransfer, and only afterwards does balances -= amount and totalDeposits -= amount. This breaks checks-effects-interactions. Any token that calls back into the recipient during transfer (ERC777-style tokensReceived hooks, or a TIP-20 or policy token with callbacks) lets the recipient call withdraw() again inside the callback. The balance check still sees the old, undebited balance, so it passes again. The final subtraction runs once per nested call, but the transfers have already left the contract.

Attack path: 1. Attacker deposits X of a callback-capable token that other users also hold in the DEX. 2. Attacker calls withdraw(token, X). 3. In the transfer hook, attacker calls withdraw(token, X) again, and repeats while the DEX still holds tokens. 4. Each nested call passes the stale balance check and receives X. 5. The nested subtractions then underflow, or succeed only if the balance covers them. Since the balance only needs to cover the last unwind, the attacker can arrange repeated withdrawals of at most the pooled balance. They can also pair this with a mid-callback placeOrder or fill to keep the checked balance valid.

Impact: Depositors' funds in any callback-capable token can be drained from the shared pool, up to what the DEX holds of that token.

## [Medium] deposit credits the nominal amount, not the amount received (fee-on-transfer / rebasing tokens)

File: StablecoinDEX.sol
Function: deposit()

deposit() accepts any token address. It credits balances[msg.sender][token] and totalDeposits[token] with `amount` after safeTransferFrom, without measuring the balance change. For a token that charges a transfer fee, burns, or has transfer-policy side effects, the contract receives less than it credits. The shortfall is borne by other depositors of that token, who are paid out of the shared pool.

Attack path: 1. The attacker deposits a fee-on-transfer token that other users have also deposited. 2. The attacker is credited the full amount while the contract received less. 3. The attacker withdraws the full credited amount and takes the difference from other users' funds.

Impact: Insolvency for that token pool. Later withdrawers cannot be paid in full.

## [Medium] MAX_PRICE_DEVIATION is never enforced; no price bounds and no check that base != quote

File: StablecoinDEX.sol
Function: placeOrder()

The contract declares MAX_PRICE_DEVIATION (1% from parity) for stablecoin pairs but never uses it. placeOrder only requires price != 0. It also does not require baseToken != quoteToken or any whitelist of tokens. Orders can be placed at arbitrary prices, for example 1 wei or 1e30. A same-token order with price below 1e18 is a guaranteed loss for the maker. A fat-fingered price, or an order made to look like a stablecoin pair, lets a taker take value at an unintended rate.

Attack path: 1. A maker mis-enters a price, or is steered into doing so, for example via the front end. 2. A taker immediately calls fillOrder on that order. 3. The taker receives the base amount for a negligible quote amount.

Impact: Makers can lose funds from mispriced orders, and the stated 1% parity safeguard does not exist.

## [Medium] Price/quote math ignores token decimals, so cross-decimal pairs misprice orders

File: StablecoinDEX.sol
Function: fillOrder()

fillOrder computes quoteAmount = amount * price / 1e18 directly in raw token units. It never normalizes for baseToken and quoteToken having different decimals, for example a 6-decimal stablecoin against an 18-decimal one. A '1:1' price of 1e18 therefore trades 1e6 raw units of a 6-decimal token for 1e6 raw units of an 18-decimal token, which is a factor of 1e12 off. Makers must hand-compute decimal-adjusted prices. MIN_ORDER_SIZE is also a raw 1e6 and is defined as '1 token (6 decimals)', so it means something different for every token. For a low-priced 6-decimal quote, the floor division can round quoteAmount down to a fraction of what the amount is worth.

Attack path: 1. A maker lists 6-decimal token A against 18-decimal token B at price 1e18, treating it as parity. 2. A taker fills the whole order and pays only 1e6 raw B for 1e6 raw A, which is about 1e-12 of the value. 3. Conversely, a maker who prices in raw units can have takers mis-fill at a huge premium.

Impact: Orders in mixed-decimal pairs clear at wildly wrong rates, so makers lose nearly the full value of their locked base tokens, or takers overpay.

## [Medium] fillOrder rounds quote down with no minimum fill, letting takers shave maker proceeds

File: StablecoinDEX.sol
Function: fillOrder()

quoteAmount = amount * price / 1e18 rounds down in the taker's favor on every fill. Only quoteAmount != 0 is required. The MIN_ORDER_SIZE check applies to placeOrder only, not to fills. Splitting a fill into many tiny partial fills lets the taker lose up to one base unit of quote per fill. The maker is underpaid by the sum of those roundings. The loss is meaningful for large prices or low-decimal tokens, and for cheap-gas chains such as Tempo.

Attack path: 1. A maker has an order at price 1.9e18. 2. The taker calls fillOrder(id, 1) repeatedly. Each call pays 1 quote unit for 1 base unit worth 1.9. 3. The taker repeats this until the order is exhausted.

Impact: Maker receives less than the order price, up to about 47% less in the worst case. This is limited by gas cost and by the token's decimals.

## [Medium] Partial fills can leave sub-minimum or unfillable dust orders that stay in the book

File: StablecoinDEX.sol
Function: fillOrder()

MIN_ORDER_SIZE is enforced only in placeOrder. fillOrder accepts any amount up to order.remaining, so a taker can leave a residual far below the minimum. When price is low, the residual's quoteAmount rounds to 0 and fillOrder reverts with InvalidAmount, so the order can never be filled again. Such dust orders stay linked in orderHeads and are returned by getOrders. Because the book is a head-inserted list with no price sorting, junk entries at the head crowd out useful ones in maxOrders-bounded reads. This is separate from the rounding-down issue already reported: here the problem is that the order stays unfillable and in the book.

Attack path: 1. A maker places an order at a low price. 2. A taker fills it down to a residual whose amount*price < 1e18. 3. The order is now unfillable and stays in the list until the maker cancels it, which only the maker would do.

Impact: The order book accumulates stuck, unfillable orders. Routing that reads getOrders(maxOrders) sees unusable liquidity, and the maker's residual base tokens stay locked.
