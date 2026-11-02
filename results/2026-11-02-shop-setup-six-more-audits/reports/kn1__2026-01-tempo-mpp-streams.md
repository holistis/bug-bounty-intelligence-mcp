# Audit report

## [Medium] initiateClose() has no access control: anyone can force-close any channel and strand unsettled vouchers

File: TempoStreamChannel.sol
Function: initiateClose()

initiateClose() only checks that the channel exists, is not finalized and has gracePeriodEnd == 0. It never checks msg.sender against channel.payer or channel.payee, and there is no way to cancel it. Any address can start the 1-hour grace period on any channel. After the period ends, finalize() is also open to everyone and sets finalized=true. It refunds deposit - settled to the payer, and settle() then reverts with ChannelAlreadyFinalized. Voucher-based streaming depends on the payee settling lazily, so a payee who is offline for an hour, or a channel that is meant to run for a long time, is broken by a third party.

Attack path: 1. A payer and payee have an active channel with outstanding signed but unsettled vouchers. 2. The attacker calls initiateClose(channelId). 3. The payee does not settle within 1 hour. 4. The attacker, or the payer, calls finalize(channelId). 5. The remaining deposit goes back to the payer, the channel is finalized, and the payee can no longer settle its vouchers.

Impact: Unauthorized parties can terminate any channel. Payees lose earned but unsettled payments, and the service is disrupted. Closing costs the attacker only gas.

## [Medium] openChannel() never uses or validates `deadline`

File: TempoStreamChannel.sol
Function: openChannel()

The `deadline` parameter is documented as the timestamp by which the transaction must be included. The function never reads it, and the DeadlineExpired error is declared but never used. A delayed or held transaction therefore still opens the channel and pulls the deposit at any later time. The channelId also depends on block.timestamp, so the ID changes with inclusion time.

Attack path: 1. The payer signs and broadcasts openChannel with a deadline. 2. A validator, relayer or congestion delays the transaction beyond the deadline. 3. The transaction is included anyway, and the deposit is locked in a channel the payer no longer wanted.

Impact: The advertised safety guarantee does not exist. A late inclusion locks funds under conditions the user did not accept. The payer can recover them only through the 1-hour close flow.

## [Medium] authorizedSigner may be address(0), letting any invalid signature authorize settle()/close()

File: TempoStreamChannel.sol
Function: openChannel()/_recoverSigner()/settle()

openChannel() does not reject authorizedSigner == address(0). _recoverSigner() returns address(0) for a signature that is not 65 bytes, and the raw ecrecover also returns 0 for invalid signatures, including a v other than 27 or 28. In settle() and close() the check `signer != channel.authorizedSigner` then passes for any garbage signature if authorizedSigner is 0. Anyone can then settle arbitrary cumulativeAmount vouchers to the payee, and close() is gated only by the payer signature.

Attack path: 1. A payer opens a channel with authorizedSigner = 0, for example by passing an unset or default value. 2. The payee, or anyone, calls settle() with cumulativeAmount = deposit, a fresh nonce, and an empty or garbage signature. 3. The signer is recovered as 0 and equals authorizedSigner. 4. The whole deposit is transferred to the payee.

Impact: A single unvalidated input lets the payee drain the full deposit with no valid voucher.

## [Medium] A voucher whose cumulativeAmount exceeds the deposit cannot be partially settled, which can strand earned funds

File: TempoStreamChannel.sol
Function: settle()/close()

settle() reverts with InsufficientDeposit when delta > deposit - settled instead of paying out the available balance. close() reverts through an arithmetic underflow in `deposit - voucher.cumulativeAmount` when cumulativeAmount > deposit. If the payer signs a cumulative voucher larger than the deposit, which is normal when metered usage outruns funding, the payee cannot claim the remaining balance with that voucher. The payee must hold an earlier voucher that fits, with nonce > settledNonces. Otherwise finalize() refunds the whole remainder to the payer.

Attack path: 1. A channel has deposit 100 and settled 60. 2. The payer signs voucher nonce 10 with cumulative 150 and has consumed the service. 3. The payee's settle() reverts, and no earlier unsettled voucher between 60 and 100 exists. 4. The payer calls initiateClose() and then finalize() after the grace period. 5. The payer gets back 40 even though the usage was already served.

Impact: The payee loses up to the remaining deposit for services already rendered, and a payer who overspends gets free usage.

## [Medium] Settle vs finalize race at the grace period boundary

File: TempoStreamChannel.sol
Function: settle()/finalize()

settle() has no check on gracePeriodEnd, and finalize() is allowed once block.timestamp >= gracePeriodEnd. The payee's final-settlement window therefore overlaps with the point at which anyone can finalize. Whoever is included first in the first block at or after gracePeriodEnd wins. A payer or watcher can finalize immediately at expiry and front-run the payee's pending settle(), which then reverts with ChannelAlreadyFinalized. The payee also has no way to extend the grace period.

Attack path: 1. The payer calls initiateClose(). 2. The payee submits settle() near the end of the grace period. 3. The payer submits finalize() with higher priority once the timestamp reaches gracePeriodEnd. 4. The channel is finalized first, and the payee's voucher payment is lost.

Impact: Payees lose earned funds when their final settlement lands at the boundary, or are forced to settle well before the deadline.

## [Medium] Any ERC20 accepted, with deposits credited at nominal amount (fee-on-transfer/rebasing insolvency)

File: TempoStreamChannel.sol
Function: openChannel()/addDeposit()

openChannel() and addDeposit() record channel.deposit as the requested amount without measuring the balance actually received. They also accept any token address. For fee-on-transfer or deflationary tokens, the contract receives less than the recorded deposit. Because all channels share one balance per token, payouts from settle(), close() and finalize() are then paid from other channels' funds. The last users to withdraw find the contract short and their calls revert.

Attack path: 1. The attacker opens a channel with a fee-on-transfer token and deposit D, so the contract receives less than D. 2. The attacker, acting as both payer and payee or in collusion, settles or closes the full amount D. 3. The difference is paid from other users' balances of that token.

Impact: Theft or insolvency affecting other channels that use the same token.

## [Medium] ecrecover-only signatures: contract-wallet or P256/passkey payers and signers cannot sign vouchers or close

File: TempoStreamChannel.sol
Function: settle()/close()/_recoverSigner()

All authorization goes through the custom _recoverSigner(), which only handles 65-byte secp256k1 ecrecover signatures and has no ERC-1271 path. If channel.authorizedSigner is a smart-contract wallet, multisig or account-abstraction account, no valid signature can ever match, so settle() and close() always revert with InvalidSigner. The cooperative-close check compares ecrecover(payerSignature) with channel.payer, so a contract payer can never satisfy close() either. The contract is built for Tempo, whose native accounts can use P256 or WebAuthn keys that ecrecover cannot verify.

Attack path: 1. A payer that is a contract account, or that delegates to a contract or passkey signer, opens a channel and deposits. 2. The service streams value against vouchers signed by that account. 3. The payee calls settle(), which reverts at the signer != channel.authorizedSigner check. 4. close() reverts for the same reason. 5. The only exit is initiateClose() followed by finalize() after the grace period, which refunds the entire deposit to the payer.

Impact: The payee can never collect for service already delivered, and the payer can take the whole deposit back. Cooperative close is unusable for these account types. openChannel() does not validate the signer type, so the failure only appears later.

## [Medium] close() omits expiry/nonce checks and uses a payer signature not bound to chain, contract or nonce

File: TempoStreamChannel.sol
Function: close()

close() does not check voucher.expiry and does not check voucher.nonce against settledNonces. The payer approval is an eth_sign-style signature over keccak256('CLOSE', channelId, cumulativeAmount). It has no EIP-712 domain, no chainId and no verifying contract. Anyone can submit the pair of signatures, and the close amount is only the cumulativeAmount in the hash. A CLOSE signature the payer gave to one party can be paired by anyone with any authorizedSigner voucher for the same cumulativeAmount, including an expired or stale one. The signature also carries no chain or contract binding if a channelId were ever reproduced on another deployment.

Attack path: 1. The payer gives the payee a CLOSE signature for amount X. 2. A third party pairs it with any valid authorizedSigner voucher for X, including an expired or older-nonce one, and calls close(). 3. The channel is finalized at a time and sequence the payer and payee did not choose, and any further vouchers or deposits are cut off.

Impact: Cooperative close can be triggered or front-run by arbitrary parties using stale vouchers. The unbound CLOSE message weakens the payer-consent guarantee.
