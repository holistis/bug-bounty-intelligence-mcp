# OSSR-005 | Forte reproduction

Original repository:
https://github.com/evmbench-org/2025-04-forte

Pinned source commit:
ce7f56c96c385d87a4be9737acea8fe9b425576a

Solidity compiler: 0.8.24
Foundry: 1.5.1-stable

## Reproduction

1. Clone the original Forte repository.
2. Check out the pinned source commit.
3. Copy the five supplied `.t.sol` files into `test/`.
4. Install the required Foundry dependencies and compiler.
5. Execute:

   forge test --offline --use 0.8.24 \
     --match-contract 'OSSR005Forte*' -vv

Expected result: 11 tests pass.

These tests reproduce observed behavior. A passing test
does not mean that the original library is secure.

No changes to the original Solidity source are required.
