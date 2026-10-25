# The first real payment, 25 October 2026

On the evening of 25 October 2026 we paid our own scan endpoint once, with real USDC on Base, to see the receipt on a real payment. This was a self test. The payer is the project's own address (0xdffcC75a674257be6FE1b5549FE52e8f8a6A3A5A, the tip address in the main README) and the receiver is the payment address of the service, so it is not a customer and it does not count as one.

Transaction: [0x6a2ec7952f1ff68064ecd6f50381802b9618ac10318b819a008a3fba39437df9](https://basescan.org/tx/0x6a2ec7952f1ff68064ecd6f50381802b9618ac10318b819a008a3fba39437df9), 5.1 USDC, Base mainnet.

## What happened

The service accepted the transaction (HTTP 200), queued the scan on the public repository of one Sherlock contest (symm-io-stacking), delivered the report 35 seconds later and returned a signed receipt twice: in the body as `receipt` and in the `PAYMENT-RESPONSE` header. The sha256 of the delivered report is the same in the status answer, in the `X-Report-Sha256` header and in the file here.

## Check it yourself

```bash
npm install ethers
node verify-receipt.mjs receipt-evidence.json
```

It makes five checks and prints pass or FAIL for each:

1. The signature on the receipt recovers to an address.
2. The offer that the live endpoint signs today recovers to the same address, so the key that signs offers also signed this receipt. That address is 0xf30b0706E78b3166745E6a2f351992321088058f, a key that only signs and holds no funds.
3. The transaction exists on Base and succeeded.
4. It is a USDC transfer to the payment address of the service.
5. The payer in the receipt is the sender of that transfer.

All five pass on 25 October 2026. The first version of our own payer check said false because of a bug in our check script. We read the chain again, the payer matches, and the evidence file says so under `controle.opmerking`.

## What this shows and what it does not

- It shows that the service saw this payment and signed a receipt for it, in the place and shape the offer-receipt extension describes.
- It does not show anything about the quality of the report. The report is in this folder; read it for yourself.
- It is one payment, by us, to ourselves. Nobody else has used the receipt yet.
- It is a version 1 receipt. The salted commitment of version 2 (level 4 and 5 of the conformance ladder) is not part of it and waits for x402 pull request 3827.
- The conformance checker `agent-receipt-verify` still reports level 3 as not measured, because it checks without paying. The script here checks a receipt that came from a real payment.

## Files

- `receipt-evidence.json`: the full answer of the service, the header, and our own check of it.
- `verify-receipt.mjs`: the check above.
- `report-bi-mvo0c37e-g890.html`: the report as delivered.
- `SHA256SUMS`: the hashes of these files.
