# Hagane - Quiet Finance

A batch-swap app for Arc Network. Connect a wallet, tick up to 10 ERC-20 tokens, review the estimated USDC, and convert them all to USDC in a single transaction. A minimum-output check protects against bad prices.

Built with [Arc Studio](https://studio.arc.io)

## What you can do

- Connect a browser wallet and switch to Arc Testnet.
- See your real balances for EURC, WETH, and cirBTC.
- A summary panel shows the estimated value of your other tokens, your USDC balance, and the total. Scan and the 30-second live countdown refresh balances and prices.
- A token can be selected only if its whole balance is worth $0.05 to $5.00, its USDC pool holds at least $1,000, and what is left after gas, the pool fee and slippage is positive. Others get an orange dot and a reason: Suspect, Value too high, Value too low, No liquidity, or High loss.
- Eligible tokens are listed first, highest value on top. Suggest selects the best eligible tokens (up to 10) and Clear selection empties the choice.
- Swaps are blocked, with a warning, when your wallet has no USDC to pay gas.
- Tick the tokens to convert (the whole balance of each is always swapped), see a live USDC estimate and a minimum received for your chosen slippage.
- Review a final confirmation that warns the swap cannot be undone, with the estimated net USDC, gas, and the minimum you will get. The wallet only opens when the quote is fresh.
- Approve tokens once, sign one gasless permit, and send the swap. Cancelling in your wallet keeps your selection.
- Follow the status from waiting to processing, then a result screen with the real USDC received, tokens converted, gas spent, an explorer link, and the reason for anything that failed. Tokens that did not convert stay in your wallet and stay eligible.
- If a selected token's value moves outside $0.05 to $5.00, it is deselected with a warning.
- If your wallet leaves Arc Testnet, the app pauses and asks you to switch back.
- When nothing qualifies, the list says "No eligible tokens found" and shows why each token is ineligible. USDC is never listed.

## Tech stack

- React, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit, Framer Motion
- Solidity 0.8.28 and Foundry (contract and tests)
- Uniswap V2-style router for swaps, Permit2 for token approvals
- Arc Testnet (USDC as the gas token)

## Development

Prerequisites: Bun and Foundry.

Install:

```bash
bun install
```

Environment variables (public values, set in `.env`; restart the dev server after changing them):

- `VITE_HAGANE_BATCH_SWAP_ADDRESS`: address of the deployed HaganeBatchSwap contract.
- `VITE_EURC_ADDRESS`, `VITE_WETH_ADDRESS`, `VITE_CIRBTC_ADDRESS`: tokens listed by default.
- `ARC_TESTNET_RPC_URL` (optional): Arc Testnet RPC endpoint for the contract fork tests.

Run the app:

```bash
bun run dev
```

Check, build, and test:

```bash
bun run check
bun run contracts:build
bun run contracts:test
```

Contract tests that need a live Arc Testnet fork are skipped unless `ARC_TESTNET_RPC_URL` is set.

## Notes

This is a testnet project. The swap router is a community Uniswap V2 deployment and has not been audited. Only tokens with a direct pool to USDC can be swapped.
