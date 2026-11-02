# Audit report

## [Medium] Permissionless 1-wei donation via executeFeeSwap permanently bricks pool initialization (div by zero / zero shares)

File: FeeAMM.sol
Function: executeFeeSwap() / mint()

executeFeeSwap has no access control and computes amountOut = amountIn*M/SCALE, which is 0 for amountIn = 1. The require on reserveValidatorToken >= 0 passes even for an empty pool, so the call pulls 1 wei of userToken and sets reserveUserToken = 1 while totalSupply stays 0. mint() only takes the initialization branch when BOTH reserves are zero. With reserveUserToken != 0 it goes to the else branch, where denom = reserveValidatorToken + N*reserveUserToken/SCALE = 0 and the division reverts. If the reserves are made nonzero (for example by rebalanceSwap(amountOut=1), which moves 1 wei from the user side to the validator side), the else branch gives liquidity = amount*0/denom = 0 or amount*totalSupply(0)/denom = 0, and mint reverts with INSUFFICIENT_LIQUIDITY. totalSupply stays 0 and no path ever adds LP supply again.

Attack path: 1. Pick a token pair (userToken, validatorToken) whose pool has not been initialized yet, or front-run the first mint. 2. Approve and call executeFeeSwap(userToken, validatorToken, 1). This transfers 1 wei in and pays out 0. 3. The pool now has reserveUserToken = 1 and totalSupply = 0. 4. Every later mint() reverts, either with a division by zero or with INSUFFICIENT_LIQUIDITY. No path restores a mintable state, so the pool can never be initialized.

Impact: Anyone can permanently block liquidity provision for any not-yet-initialized fee token pair for the cost of 1 wei. Fee swaps for that pair then cannot work, which is a protocol-level DoS for stablecoin pairs.

## [Medium] executeFeeSwap is callable by anyone at a fixed 0.997 rate with no oracle or peg check

File: FeeAMM.sol
Function: executeFeeSwap()

executeFeeSwap is external with no caller restriction. It swaps msg.sender's userToken for validatorToken from the pool at a hard-coded rate of M/SCALE = 0.997, with no price check. The function is described as the fee-collection path of the fee manager, yet any account can use it, with any userToken address. LPs deposit only validator tokens, and whoever calls first can sell any token at 0.997 against the pool's real validator token.

Attack path: 1. A pool exists with validator-token liquidity. 2. The userToken depegs, or the attacker uses a token whose value is below 0.997 of the validator token. 3. The attacker calls executeFeeSwap with a large amountIn and takes 0.997*amountIn of validator token up to the pool reserve. 4. LPs are left with the worthless or depegged userToken, and only rebalanceSwap, which itself pays at 0.9985, can ever convert it back.

Impact: Pool validator-token liquidity can be drained at a fixed price whenever the user token is worth less than the pool price. LPs bear the full depeg loss.

## [Medium] Mint prices LP shares with userToken discounted by N but burn pays out proportionally, so mint then burn extracts value from LPs

File: FeeAMM.sol
Function: mint() / burn()

mint() values the pool as denom = reserveValidatorToken + (N/SCALE)*reserveUserToken, which discounts userToken by 0.15%. burn() redeems pro rata at the full reserves of both tokens without that discount. A depositor who mints validator tokens and burns the shares in the same block therefore receives a mix of both tokens worth about a + a*0.0015*rU/(D+a), which is more than the a deposited. No fee is charged on mint or burn.

Attack path: 1. A pool holds a significant reserveUserToken, for example after fee swaps. 2. The attacker mints with a large amountValidatorToken. 3. The attacker immediately burns all of the new shares and receives validator and user tokens worth more than the deposit. 4. The attacker repeats this to capture the 0.15% spread meant for LPs and rebalancers.

Impact: Value is extracted from existing LPs at the expense of the rebalance spread. The loss scales with the pool's userToken reserve and the attacker's size.

## [Medium] Unchecked ERC20 return values and unchecked uint128 additions (Solidity 0.7.6, no SafeMath)

File: FeeAMM.sol
Function: mint() / executeFeeSwap()

All transfer and transferFrom calls ignore their bool return value. A token that returns false instead of reverting would credit reserves without the tokens arriving. In mint, pool.reserveValidatorToken += uint128(amount) and in executeFeeSwap, pool.reserveUserToken += uint128(amountIn) are plain uint128 additions under 0.7.6 with no overflow check. Only rebalanceSwap checks for overflow.

Attack path: 1. A token returns false on a failed transfer. 2. The attacker calls mint or executeFeeSwap without paying, and the reserves are still increased. 3. Alternatively, huge amounts make the uint128 reserve wrap around.

Impact: Reserve accounting can diverge from real balances, which makes the pool insolvent. This needs a non-reverting or unusual token, so the practical likelihood is low.

## [Medium] burn()/executeFeeSwap() update state after external token calls; unchecked subtraction can underflow

File: FeeAMM.sol
Function: burn()

burn() transfers userToken and validatorToken to `to` before it decrements liquidityBalances, totalSupply and the reserves. executeFeeSwap() checks reserveValidatorToken >= amountOut, then calls transferFrom, and only afterwards subtracts amountOut. rebalanceSwap() has the same order. The contract is compiled with Solidity <0.8, so `pool.reserveValidatorToken -= uint128(amountOut)` and `liquidityBalances -= liquidity` wrap silently instead of reverting. If either token calls back into the contract during a transfer (ERC777-style hooks, or a token with a transfer-policy callback), the balance and reserve checks are evaluated against stale state.

Attack path: 1. An attacker uses a pool whose token invokes a callback on transfer. 2. During burn()'s first transfer, the callback re-enters burn() with the same liquidity. The balance check still passes, because liquidityBalances has not been decremented. 3. The attacker is paid twice from the pool. 4. The later unchecked subtractions wrap the reserves and balances. The same pattern applies to executeFeeSwap(): two re-entrant calls both pass the reserve check, then the reserve subtraction underflows.

Impact: If a token with callbacks is used in a pool, the pool's reserves can be drained and its accounting corrupted. This does not apply to plain ERC20 stablecoins.

## [Medium] checkSufficientLiquidity multiplies unchecked in 0.7.6 and can wrap, passing the check for huge maxAmount

File: FeeAMM.sol
Function: checkSufficientLiquidity()

`amountOutNeeded = (maxAmount * M) / SCALE` is computed with no overflow check and no _requireU128 on maxAmount. For maxAmount above 2^256/9970 the product wraps to a small value, so the `reserveValidatorToken >= amountOutNeeded` check passes. executeFeeSwap() would later revert for the same amount, because it applies _requireU128 to amountIn.

Attack path: 1. A caller or protocol path supplies a maxAmount near 2^256/M. 2. The product wraps and the liquidity pre-check succeeds although the pool cannot cover the fee. 3. The later executeFeeSwap() reverts.

Impact: The liquidity pre-check gives a false positive, which can cause fee-payment validation to disagree with fee-swap execution. Whether this is reachable depends on external callers, which I could not see.

## [Medium] Pool residual reserves stranded behind MIN_LIQUIDITY shares; later minters lose value to rounding

File: FeeAMM.sol
Function: mint()

After the last LP burns, the 1000 locked MIN_LIQUIDITY shares remain in totalSupply, and the pool keeps reserves for them. Fee-swap gains and rounding dust accumulate there. The next mint() uses the non-initial branch with `liquidity = amount * _totalSupply / denom`. If denom is large relative to the supply of about 1000, liquidity rounds down heavily or hits zero, which reverts.

Attack path: 1. LPs exit, leaving a supply of 1000 against meaningful residual reserves. 2. A new LP deposits an amount whose share value is not a multiple of denom/1000. 3. The new LP receives floor-rounded shares. The rounding loss, up to about denom/1000 in value, goes to the locked shares. mint() has no minLiquidity argument, so the LP cannot protect against this.

Impact: Small deposits are partly lost or blocked, and the pool can effectively become unusable for small LPs. This is an edge case with limited loss.
