# A purchase of the quick scan with a standard x402 client at its default limit, 25 October 2026

The quick scan costs exactly 1 dollar because the official x402 client refuses payments above 1 dollar per request unless its owner raises the limit. This folder checks that claim with a real purchase.

## What was done

The throwaway address 0xAcAA4523430Bd9CC86541B65FbaCCaE942cBAC6e, funded with exactly 1.00 USDC from the project's own address, bought the quick scan at https://x402.tokenizen.nl/api/bug-intel-quick with @x402/fetch 2.28.0 and without raising the spend limit (the script printed that the default limit of 1 dollar stayed in place). The service answered HTTP 200 with a signed receipt in the body and in the PAYMENT-RESPONSE header. The scan was delivered 50 seconds after the request, with 15 hypotheses and no second list.

Settlement transaction: [0xc70f61cc79b604a6822a84e0b104df1876a50762dc8c1b0cae6f15e25b6ddf01](https://basescan.org/tx/0xc70f61cc79b604a6822a84e0b104df1876a50762dc8c1b0cae6f15e25b6ddf01), 1 USDC, Base mainnet, to the payment address of the service. The sha256 of the delivered report is the same in the status answer, the X-Report-Sha256 header and this folder.

## Check it yourself

```bash
npm install ethers
node ../first-real-payment/verify-receipt.mjs receipt-evidence.json
```

The same six checks as for the first payment. All six pass on 25 October 2026. The purchase script is buy-with-standard-client.mjs; use the flags --snel and --standaard-limiet, and --ja-echt-geld to pay for real.

## What this shows and what it does not

- A client with default settings can buy the quick scan end to end, while the full scan needs its owner to raise the limit to 5 dollars. The earlier purchase of the full scan is in [../standard-client-purchase/README.md](../standard-client-purchase/README.md).
- It is a self test with our own money, one purchase, and it does not count as a customer.
- The receipt is version 1. It says the service saw this payment; it says nothing about the quality of the report.

## Files

- receipt-evidence.json: the full answer of the service and the settlement header.
- report-bi-mvo6h1u6-sheu.html: the report as delivered.
- buy-with-standard-client.mjs: the purchase script.
- SHA256SUMS: the hashes of these files.
