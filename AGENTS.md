# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

[Brief description of what the app does and its primary use case]

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Deployed Contracts

- `HaganeBatchSwap` on Arc Testnet: `0xc49536a97b8f75bf534116e0528ded2941d73d31` (source `contracts/HaganeBatchSwap.sol`, metadata `contracts/contract-metadata/HaganeBatchSwap.json`).
  - Constructor: owner = platform deployer wallet, router = community Uniswap V2 router `0xE27d5D256B370604F1Ff060fB489c6A8E3F8A6D9` (third-party, unaudited), USDC `0x3600000000000000000000000000000000000000`, Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`.
  - `batchSwap(tokens, amounts, minUsdcOut, permitNonce, deadline, signature)`: Permit2 batch SignatureTransfer (spender = this contract), max 10 tokens, direct path [token, USDC], aggregate slippage check.
  - Owner is the shared platform wallet, so `setRouter` cannot be called by the user on this deployment. Self-deploy to own it.
  - Test-only mocks live in `contracts/mocks/`. Mock-router multi-token scenarios were tested on a fork, not deployed to testnet.
  - Integration script: `/home/user/fork-tests/HaganeBatchSwap.integration.test.ts` (34 checks passed on a fork).

## Frontend (Hagane)

- Aesthetic: dark green/black, cyan details, red seal accents; Shippori Mincho display, DM Sans UI, JetBrains Mono numbers. Tokens live in `tailwind.config.js` (`sumi`, `moss`, `pine`, `vein`, `mist`, `fog`, `cyan`, `seal`).
- Contract and token addresses come from `.env` (`VITE_HAGANE_BATCH_SWAP_ADDRESS`, `VITE_EURC_ADDRESS`, `VITE_WETH_ADDRESS`, `VITE_CIRBTC_ADDRESS`). Router and Permit2 addresses are read from the contract.
- No simulated data: balances, allowances, quotes (router `getAmountsOut`) and tx state are all live. Tokens without a pool to USDC show "No route" and block the swap.
- Eligibility (`src/lib/eligibility.ts`, `src/hooks/useEligibleTokens.ts`; UI-only, the contract does not enforce it). Value = router quote of the whole balance on token->USDC (the execution route), USDC treated as $1. Reasons in precedence order: noLiquidity (no route/pair), suspect (pair USDC reserve x2 < $1,000, `usePoolLiquidity`), low (< $0.05), high (> $5.00), loss (net <= 0, where net = value x (1 - slippage) - gas share; the 0.3% pool fee is already in the quote). Gas is estimated from `GAS` in `src/lib/hagane.ts` and the live gas price (`useGasCost`). Ineligible = orange dot + reason, checkbox disabled. List order: eligible by value desc, then checking, ineligible, empty. Suggest = top 10 eligible by value. Max 10.
- No USDC for gas (USDC is the gas token): `GasWarning` banner and the swap button blocked when the USDC balance is 0 or below the batch gas estimate.
- Edge-case flow: `src/App.tsx` owns selection state. A selected token that turns ineligible is dropped during render with a notice (`DeselectNotices`). `ConfirmDialog` (irreversible warning, net estimate, gas, minimum, quote freshness gate of 30s) opens before the wallet; `useBatchSwap` returns a `SwapResult` (real USDC from the BatchSwapped event, per-token outcomes measured from balances, gas spent across all txs) shown in `ResultModal`; the review, processing and result views all use `ModalShell` (`ConfirmDialog`, `ProgressModal`, `ResultModal`). Wallet cancel returns to idle with the selection intact. `NetworkGuard` pauses the app when the wallet leaves Arc. USDC is filtered out of the token list in `useTokenList`.
- Known gap: the deployed contract is all-or-nothing, so a failing token reverts the whole batch (all tokens stay in the wallet). True "do what you can" partial success needs a contract change (per-token try/catch). The frontend already reports per-token outcomes, so it will work unchanged with such a contract.
- Flow (`src/hooks/useBatchSwap.ts`): Permit2 allowances (max, one-time per token) -> EIP-712 PermitBatchTransferFrom signature (spender = HaganeBatchSwap) -> `batchSwap` -> receipt, `BatchSwapped` event for the actual USDC out.
- Files: `src/lib/hagane.ts` (constants, ABIs, errors), `src/hooks/` (config, tokens, quotes, swap flow), `src/components/` (Header, TokenList, ReviewPanel, FlowStatus, AddToken).

## To Run

```bash
bun install
bun run dev
```
