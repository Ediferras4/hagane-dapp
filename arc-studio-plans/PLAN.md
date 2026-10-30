## Implementation Plan: Hagane - Quiet Finance (HaganeBatchSwap contract)

### Summary
`HaganeBatchSwap` takes up to 10 ERC-20 tokens from a user and swaps each to USDC through a Uniswap V2-style router in one transaction. It reverts if the user would receive less than their minimum USDC. This step covers only the contract, its tests, and a testnet deployment. The frontend comes later.

### Architecture
- Blockchain: Arc Testnet (chain ID 5042002). USDC is the gas token and sits at 0x3600000000000000000000000000000000000000 (6 decimals).
- Contract: HaganeBatchSwap on OpenZeppelin 5 (Ownable2Step, ReentrancyGuard, SafeERC20).
  - batchSwap(tokens, amounts, minUsdcOut, permitNonce, deadline, signature): pulls all tokens in one Permit2 call, swaps each to USDC along path [token, USDC], checks the total against minUsdcOut, and sends the USDC to the caller.
  - setRouter(address): owner-only, emits RouterUpdated.
  - Router, USDC, and Permit2 addresses are set in the constructor. Permit2 is the Arc predeploy at 0x000000000022D473030F116dDEE9F6B43aC78BA3.
- Approvals (Permit2): each token needs a one-time approve(Permit2, max) from the user. After that, each batch needs one typed-data signature (no gas) plus the batchSwap transaction. The wallet shows a signature request and a transaction request per batch. It is not a single prompt for everything.
- Router: any Uniswap V2 router that supports swapExactTokensForTokensSupportingFeeOnTransferTokens. Fee-on-transfer tokens work because the contract swaps the amount it actually received.
- Slippage: the contract measures its USDC balance before and after all swaps and reverts with SlippageExceeded if the difference is below minUsdcOut. Each hop uses amountOutMin = 0 because the check is on the batch total.
- Batch is all-or-nothing. Duplicate tokens, USDC as input, zero amounts, and more than 10 tokens revert. The contract keeps no funds between transactions.
- Trust: the owner can change the router. The router is a third-party, unaudited contract. Arc's official docs list no DEX router on testnet.
- Frontend: none in this step.
- Wallet: ConnectKit (default) when the UI is built later.

### Solidity draft (build agent finalizes after review)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IUniswapV2Router {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

interface IPermit2 {
    struct TokenPermissions { address token; uint256 amount; }
    struct PermitBatchTransferFrom {
        TokenPermissions[] permitted;
        uint256 nonce;
        uint256 deadline;
    }
    struct SignatureTransferDetails { address to; uint256 requestedAmount; }

    function permitTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

contract HaganeBatchSwap is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_TOKENS = 10;

    IERC20 public immutable USDC;
    IPermit2 public immutable PERMIT2;
    IUniswapV2Router public router;

    event RouterUpdated(address indexed oldRouter, address indexed newRouter);
    event BatchSwapped(address indexed user, uint256 tokenCount, uint256 usdcOut);

    error InvalidBatch();
    error ZeroAddress();
    error ZeroAmount();
    error DuplicateToken(address token);
    error TokenIsUSDC();
    error NothingReceived(address token);
    error Expired();
    error SlippageExceeded(uint256 received, uint256 minimum);

    constructor(address initialOwner, address router_, address usdc_, address permit2_)
        Ownable(initialOwner)
    {
        if (router_ == address(0) || usdc_ == address(0) || permit2_ == address(0)) revert ZeroAddress();
        router = IUniswapV2Router(router_);
        USDC = IERC20(usdc_);
        PERMIT2 = IPermit2(permit2_);
        emit RouterUpdated(address(0), router_);
    }

    function setRouter(address newRouter) external onlyOwner {
        if (newRouter == address(0)) revert ZeroAddress();
        emit RouterUpdated(address(router), newRouter);
        router = IUniswapV2Router(newRouter);
    }

    function batchSwap(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256 minUsdcOut,
        uint256 permitNonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant returns (uint256 usdcOut) {
        uint256 n = tokens.length;
        if (n == 0 || n > MAX_TOKENS || n != amounts.length) revert InvalidBatch();
        if (block.timestamp > deadline) revert Expired();

        IPermit2.TokenPermissions[] memory permitted = new IPermit2.TokenPermissions[](n);
        IPermit2.SignatureTransferDetails[] memory details = new IPermit2.SignatureTransferDetails[](n);
        uint256[] memory balBefore = new uint256[](n);

        for (uint256 i; i < n; ++i) {
            address t = tokens[i];
            if (t == address(0)) revert ZeroAddress();
            if (t == address(USDC)) revert TokenIsUSDC();
            if (amounts[i] == 0) revert ZeroAmount();
            for (uint256 j; j < i; ++j) if (tokens[j] == t) revert DuplicateToken(t);

            permitted[i] = IPermit2.TokenPermissions(t, amounts[i]);
            details[i] = IPermit2.SignatureTransferDetails(address(this), amounts[i]);
            balBefore[i] = IERC20(t).balanceOf(address(this));
        }

        // One signature moves every token from the user to this contract.
        PERMIT2.permitTransferFrom(
            IPermit2.PermitBatchTransferFrom(permitted, permitNonce, deadline),
            details,
            msg.sender,
            signature
        );

        uint256 usdcBefore = USDC.balanceOf(address(this));
        IUniswapV2Router r = router;
        address[] memory path = new address[](2);
        path[1] = address(USDC);

        for (uint256 i; i < n; ++i) {
            IERC20 token = IERC20(tokens[i]);
            // Use the amount actually received, so fee-on-transfer tokens work.
            uint256 received = token.balanceOf(address(this)) - balBefore[i];
            if (received == 0) revert NothingReceived(tokens[i]);

            path[0] = tokens[i];
            token.forceApprove(address(r), received);
            r.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                received, 0, path, address(this), deadline
            );
            token.forceApprove(address(r), 0);
        }

        usdcOut = USDC.balanceOf(address(this)) - usdcBefore;
        if (usdcOut < minUsdcOut) revert SlippageExceeded(usdcOut, minUsdcOut);

        USDC.safeTransfer(msg.sender, usdcOut);
        emit BatchSwapped(msg.sender, n, usdcOut);
    }
}
```

### Files to Create/Modify
1. contracts/HaganeBatchSwap.sol: the contract above, finalized after review.
2. contracts/mocks/MockERC20.sol: mintable test token with configurable name and decimals.
3. contracts/mocks/MockV2Router.sol: fake V2 router that takes the input token and pays out USDC at a configurable rate, for the multi-token case.
4. contracts/mocks/MockPermit2.sol: stand-in for Permit2 in local unit tests. Real signatures are tested against the real Permit2 on a fork and on testnet.
5. contracts/test/HaganeBatchSwap.t.sol: Foundry tests for the happy path, minimum output and slippage revert, 10 vs 11 tokens, length mismatch, duplicates, zero amounts, USDC as input, expired deadline, setRouter access control, fee-on-transfer, reentrancy, and fuzzing of amounts against minUsdcOut.
6. contracts/test-integration/batchSwap.integration.ts: bun script that signs a Permit2 batch with a test wallet and calls batchSwap against the real Permit2, covering (a) real EURC to USDC on the community V2 pool and (b) several mock tokens through the mock router.
7. contracts/contract-metadata/HaganeBatchSwap.json: written by the deploy (address, ABI, network) for the later frontend step.
8. arc-studio-plans/PLAN.md: this plan.

src/App.tsx is not touched.

### Build Sequence
1. Confirm the real router. On Arc Testnet, check that the candidate community V2 router has code and that the USDC/EURC pair has reserves. Candidate: router 0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9, pair 0xb3685D16AAa06361ED28377b1319136650Fa9A13 (the "Arc Swap" project, canonical V2 bytecode). Another community deployment (ACTFUN) uses a different router. If liquidity is thin or the router is missing, stop and ask before choosing another.
2. Write contracts/HaganeBatchSwap.sol, matching the draft and the project's pinned Solidity and OpenZeppelin versions.
3. Run a balanced security review (reentrancy, approval handling, router trust surface, slippage logic). Apply fixes and re-review, up to 2 rounds.
4. Write the mocks and unit tests, then run forge test. All must pass before deploying.
5. Deploy to Arc Testnet:
   - MockERC20 tokens and MockV2Router, funded with testnet USDC from the faucet.
   - HaganeBatchSwap with the community router, USDC 0x3600000000000000000000000000000000000000, and Permit2 0x000000000022D473030F116dDEE9F6B43aC78BA3.
   - A second HaganeBatchSwap instance pointed at the mock router, so 5 to 10 tokens can be tested without real pools.
6. Run the integration script on a fork, then on testnet: approve tokens to Permit2 once, sign the batch with a test wallet, call batchSwap, confirm the USDC delta matches the BatchSwapped event, and confirm a too-high minUsdcOut reverts.
7. Report deployed addresses and per-scenario results, then offer the frontend as the next step.

### How to test in the Arc Studio preview
- The preview panel shows a UI, and there is no UI in this step. The contract is tested through scripts the build agent runs, not buttons.
- Deployed contracts appear in the Contracts panel, transactions in the trace, and results are reported in chat.
- Real swap: EURC to USDC on the community pool, one token. It proves the router integration and Permit2 against real liquidity.
- Multi-token swap: 5 to 10 mock tokens through the mock router. It proves the loop, the 10-token limit, and the total-output slippage check.
- When the frontend is built, the preview becomes the place to click through the same flows.

### Done When
- [ ] HaganeBatchSwap.sol compiles and the security review ends with no unresolved critical or high findings.
- [ ] Unit tests pass, including the 10-token and 11-token boundary and the slippage revert.
- [ ] A real EURC to USDC batchSwap on Arc Testnet succeeds, and the caller's USDC increases by the amount in the BatchSwapped event.
- [ ] A batch of 10 mock tokens converts in one transaction after one Permit2 signature.
- [ ] A batch with minUsdcOut above the achievable output reverts with SlippageExceeded and the user keeps their tokens.
- [ ] Only the owner can call setRouter, and it emits RouterUpdated.
- [ ] Deployed address and ABI are saved in contracts/contract-metadata/HaganeBatchSwap.json.
- [ ] No frontend files are changed.

## Ready to build?
