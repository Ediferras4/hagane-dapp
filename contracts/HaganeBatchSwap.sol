// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
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

/// @dev Minimal canonical Uniswap Permit2 ISignatureTransfer batch surface.
interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    // ABI layout intentionally omits spender: Permit2 hashes msg.sender as spender.
    // The complete EIP-712 encodeType (including the dependency) is:
    // PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)
    struct PermitBatchTransferFrom {
        TokenPermissions[] permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

/// @notice Atomically swaps up to ten tokens to USDC using one Permit2 batch transfer.
/// @dev Built for the project's Solidity 0.8.28 / Cancun configuration.
/// The owner-selected router is trusted. Existing donated balances are not swept.
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

    /// @dev The user signs a Permit2 batch whose spender is address(this), not the router.
    /// Each input token requires a prior ERC-20 allowance from the user to Permit2.
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

        uint256[] memory received = _pullTokens(tokens, amounts, permitNonce, deadline, signature);
        usdcOut = _swapTokens(tokens, received, deadline);
        if (usdcOut < minUsdcOut) revert SlippageExceeded(usdcOut, minUsdcOut);

        USDC.safeTransfer(msg.sender, usdcOut);
        emit BatchSwapped(msg.sender, n, usdcOut);
    }

    function _pullTokens(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256 permitNonce,
        uint256 deadline,
        bytes calldata signature
    ) private returns (uint256[] memory received) {
        uint256 n = tokens.length;
        IPermit2.TokenPermissions[] memory permitted = new IPermit2.TokenPermissions[](n);
        IPermit2.SignatureTransferDetails[] memory details = new IPermit2.SignatureTransferDetails[](n);
        received = new uint256[](n);

        for (uint256 i; i < n; ++i) {
            address t = tokens[i];
            if (t == address(0)) revert ZeroAddress();
            if (t == address(USDC)) revert TokenIsUSDC();
            if (amounts[i] == 0) revert ZeroAmount();
            for (uint256 j; j < i; ++j) {
                if (tokens[j] == t) revert DuplicateToken(t);
            }

            permitted[i] = IPermit2.TokenPermissions(t, amounts[i]);
            details[i] = IPermit2.SignatureTransferDetails(address(this), amounts[i]);
            received[i] = IERC20(t).balanceOf(address(this));
        }

        // Exactly one batch SignatureTransfer; Permit2 binds the spender to this contract.
        PERMIT2.permitTransferFrom(
            IPermit2.PermitBatchTransferFrom(permitted, permitNonce, deadline),
            details,
            msg.sender,
            signature
        );

        // Snapshot every actual receipt before any router interaction can change balances.
        for (uint256 i; i < n; ++i) {
            received[i] = IERC20(tokens[i]).balanceOf(address(this)) - received[i];
            if (received[i] == 0) revert NothingReceived(tokens[i]);
        }
    }

    function _swapTokens(address[] calldata tokens, uint256[] memory received, uint256 deadline)
        private
        returns (uint256 usdcOut)
    {
        uint256 usdcBefore = USDC.balanceOf(address(this));
        IUniswapV2Router r = router;
        address[] memory path = new address[](2);
        path[1] = address(USDC);

        for (uint256 i; i < tokens.length; ++i) {
            IERC20 token = IERC20(tokens[i]);
            path[0] = tokens[i];
            token.forceApprove(address(r), received[i]);
            r.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                received[i], 0, path, address(this), deadline
            );
            token.forceApprove(address(r), 0);
        }

        usdcOut = USDC.balanceOf(address(this)) - usdcBefore;
    }
}
