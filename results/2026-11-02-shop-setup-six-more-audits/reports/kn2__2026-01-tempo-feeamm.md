# Audit report

## [Medium] 1-wei fee swap on an uninitialised pool permanently blocks the first mint (pool initialisation DoS)

File: FeeAMM.sol
Function: executeFeeSwap() / mint()

executeFeeSwap needs no existing liquidity when amountOut rounds to 0. With amountIn = 1, amountOut = 1*9970/10000 = 0, so the check reserveValidatorToken >= 0 passes. It then pulls 1 wei of userToken and does reserveUserToken += 1. mint() only takes the first-deposit branch when both reserves are zero. After the donation, reserveUserToken is 1 and totalSupply is 0, so mint takes the else branch. There, product = 9985*1/10000 = 0 and denom = reserveValidatorToken + 0 = 0, so it reverts on division by zero. With a larger donation, denom is positive but liquidity = amount * 0 / denom = 0, so it reverts with INSUFFICIENT_LIQUIDITY. Nothing in the contract can bring the pool back to (0,0) with totalSupply 0. rebalanceSwap has amountIn >= 1, so a withdrawal always leaves reserveValidatorToken > 0. executeFeeSwap only ever increases reserveUserToken.

Attack path: 1) An attacker watches the mempool for a first mint() on pool (userToken, validatorToken), or just targets any uninitialised pair. 2) They call executeFeeSwap(userToken, validatorToken, 1), which is allowed and pays out 0, so reserveUserToken becomes 1. 3) Every later mint() on that ordered pair reverts. Using rebalanceSwap(..., 1, ...) to pull the 1 wei back out leaves reserveValidatorToken = 1 and totalSupply = 0, which still reverts.

Impact: For about 1 wei, anyone can permanently stop a fee-token pair from being initialised, front-running the first LP. Validators then have no liquidity on that pair, and fee swaps in that direction fail with INSUFFICIENT_LIQUIDITY. A smaller variant on an existing pool: if reserveUserToken is 1 and reserveValidatorToken is 0, mint() divides by zero until someone swaps.

## [Medium] mint prices U reserves at 0.9985 but burn pays them at face value: risk-free mint/burn extraction

File: FeeAMM.sol
Function: mint() / burn()

mint() computes liquidity = amount * totalSupply / (reserveV + N*reserveU/SCALE), so the user-token reserve counts at a 0.9985 discount. burn() via _calculateBurnAmounts pays out a pro-rata share of reserveU and reserveV at face value (1:1). Working through the algebra, a mint of `a` followed by an immediate burn returns a + a*0.0015*reserveU/(D+a), where D = reserveV + 0.9985*reserveU. That is strictly more than was deposited whenever reserveU > 0. Nothing delays or penalises a burn right after a mint.

Attack path: 1) Wait until the pool holds user-token reserves from fee swaps. 2) Call mint() with a large validator-token amount (it can be flash-borrowed). 3) In the same transaction call burn() with the minted liquidity. 4) The attacker receives validator tokens plus a share of reserveU worth more than the deposit. The surplus comes from existing LPs. Repeat as often as wanted.

Impact: Existing LPs lose up to about 0.15% of the user-token reserve per round trip. This includes the fee income they earned, and it is repeatable and costs the attacker nothing but gas.

## [Medium] executeFeeSwap has no access control and lets anyone swap at a fixed 0.997 rate

File: FeeAMM.sol
Function: executeFeeSwap()

executeFeeSwap is meant for validator fee collection, but it is external with no caller restriction. Any address can pull validatorToken out of any pool at a fixed price of M/SCALE = 0.997 per userToken. No oracle or slippage logic applies. The caller only pays userToken via transferFrom from msg.sender.

Attack path: 1) If userToken depegs or is worthless, the attacker calls executeFeeSwap with a large amountIn. 2) They receive 0.997*amountIn of validatorToken until reserveValidatorToken is gone. 3) Alternatively, anyone can drain reserveValidatorToken on purpose, so checkSufficientLiquidity() reverts and fee payments in that token fail.

Impact: LPs absorb the full loss when the user token depegs, because the fixed-rate swap is open to everyone. The validator-token side of a pool can also be emptied cheaply to block fee payments.

## [Medium] No uint128 overflow check on reserve additions in a pre-0.8 compiler (unchecked arithmetic)

File: FeeAMM.sol
Function: executeFeeSwap() / mint()

The pragma is >=0.7.6 <0.8.0, so there is no built-in overflow checking. rebalanceSwap explicitly guards reserveValidatorToken + amountIn <= uint128 max. executeFeeSwap does `pool.reserveUserToken += uint128(amountIn)` and mint does `pool.reserveValidatorToken += uint128(amountValidatorToken)` with no such guard. Each amount is individually limited to u128, but the sum can wrap silently.

Attack path: 1) Take a pool whose reserve is close to 2^128 (a large-supply token). 2) Call executeFeeSwap or mint with an amount that pushes the sum past 2^128. 3) The uint128 reserve wraps to a small number while the full token amount is transferred in. 4) The reserve is now under-recorded, so burn and pricing no longer match the real balance.

Impact: Pool accounting is corrupted and funds are effectively locked or mispriced. It is only reachable for tokens with extremely large supplies, which limits the likelihood.

## [Medium] burn transfers tokens before updating balances and reserves (reentrancy)

File: FeeAMM.sol
Function: burn()

burn() computes the amounts, then calls IERC20.transfer to `to` for both tokens. Only after that does it decrease liquidityBalances, totalSupply and the reserves. If either token has transfer or receive hooks (ERC777-style, or a callback on the recipient), `to` can re-enter burn() before any state is reduced. The balance check and _calculateBurnAmounts still see the old values, so the same liquidity is paid out again. There is no reentrancy guard. mint() also transfers in before updating state.

Attack path: 1) An LP calls burn(L) with `to` set to a contract. 2) On the token hook, that contract calls burn(L) again. 3) The second call still sees the full balance and unchanged reserves and pays out again. 4) The state updates then run twice, which underflows the unchecked pre-0.8 subtraction or leaves the pool short.

Impact: A pool using a token with callbacks can have its reserves drained beyond the caller's share. Standard TIP-20 tokens may not have hooks, so this depends on the tokens used.

## [Medium] ERC20 transfer and transferFrom return values are ignored, with no SafeERC20

File: FeeAMM.sol
Function: executeFeeSwap()/rebalanceSwap()/mint()/burn()

All token movements use IERC20.transfer and transferFrom without checking the returned bool or using SafeERC20. For tokens that return false instead of reverting, reserves and liquidity are credited even though no tokens arrived. Tokens that return no data, such as USDT, cannot be used because the ABI decode fails.

Attack path: 1) Create a pool with a token that returns false on failed transferFrom. 2) Call mint or executeFeeSwap without allowance or balance. 3) Reserves and liquidity increase with nothing deposited. 4) Burn or swap against other users' real funds in the pool.

Impact: Phantom deposits can drain real assets from pools that use such tokens.
