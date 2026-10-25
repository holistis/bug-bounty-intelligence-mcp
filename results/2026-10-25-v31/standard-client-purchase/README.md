# A purchase with a standard x402 client, 25 October 2026

Until 25 October 2026 the paid scan endpoint could not be bought by a standard x402 client. It only accepted a transaction hash from a payment that the buyer had already made by hand. It answered 400 to the signed payment authorization that clients such as @x402/fetch send, while its own 402 answer said that such a payment would work. We found this on 25 October by testing, and fixed it the same day. This folder is the proof that it works now.

## What was done

A new throwaway address (0xAcAA4523430Bd9CC86541B65FbaCCaE942cBAC6e), funded with exactly 5.00 USDC from the project's own address, bought the scan with @x402/fetch 2.28.0 (with @x402/core and @x402/evm 2.28.0, viem 2.57.7). It signed the authorization, the settlement was submitted by a third address (0x772003a2e9c2ccc8af956870a37a66f64f8cec38) that is neither the payer nor ours, and the service answered HTTP 200 with a signed receipt in the body as `receipt` and in the `PAYMENT-RESPONSE` header. The scan was delivered 37 seconds after the request.

Settlement transaction: [0x221f1a6a5969f0888882755db8fcdb9f2c69dde86af97be95cd9fa719e7e5c4e](https://basescan.org/tx/0x221f1a6a5969f0888882755db8fcdb9f2c69dde86af97be95cd9fa719e7e5c4e), 5 USDC, Base mainnet, to the payment address of the service. The report has 30 hypotheses in two lists, and the sha256 of the delivered file is the same in the status answer, the `X-Report-Sha256` header and this folder.

## Check it yourself

```bash
npm install ethers
node ../first-real-payment/verify-receipt.mjs receipt-evidence.json
```

It is the same script of six checks as for the first payment: the receipt signature recovers to an address, the live offer is signed by the same address, that address is a controller in the DNS record `_controllers.x402.tokenizen.nl`, the transaction exists on Base, it is a USDC transfer to the payment address of the service, and the payer in the receipt is the sender of that transfer. All six pass on 25 October 2026.

`buy-with-standard-client.mjs` is the script that made the purchase. It needs `npm install @x402/core @x402/evm @x402/fetch viem`, a key file with a funded address, and the flag `--ja-echt-geld`; without the flag it only fetches the offer and checks it against a safety gate (network, price, payee, validity) and pays nothing.

## What a buyer should know

- The official client refuses a payment above 1 dollar per request unless the buyer raises the limit. The scan costs 5 dollars, so a default agent will refuse it until its owner sets `maxAmountPerPayment`. We measured this: the error reads "rejected by spendControls.maxAmountPerPayment ($1, including USDC)". The script sets the limit to 5 dollars.
- The endpoint now checks the request before it takes payment: a repository that does not exist or has no Solidity that counts is refused with a 400 or 422 before anything is settled.
- The old route still works: pay by hand, then send the transaction hash.

## What this shows and what it does not

- It shows that an agent built on the standard client can buy the scan end to end and get a receipt that anyone can check. It does not show anything about the quality of the report.
- It is a self test: the money went from our own throwaway address to our own payment address, so it is not a customer and does not count as one.
- It is one purchase. A repeat could expose a case we did not think of.
- It is a version 1 receipt, so there is no salted commitment yet.

## Files

- `receipt-evidence.json`: the full answer of the service and the settlement header.
- `report-bi-mvo54fu7-sujc.html`: the report as delivered.
- `buy-with-standard-client.mjs`: the purchase script.
- `SHA256SUMS`: the hashes of these files.
