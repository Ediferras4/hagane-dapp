// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Uniswap V3 SwapRouter02 on Arc mainnet. No `deadline` field in this struct.
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

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

/// Converts up to 10 wallet tokens to USDC in one signed batch.
/// Each token is swapped through its own Uniswap V3 pool (fee tier set by the owner).
/// USDC goes straight to the user. Each swap reverts if it returns less than that token's minimum.
contract HaganeBatchSwapV5 is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_TOKENS = 10;

    IERC20 public immutable USDC;
    IPermit2 public immutable PERMIT2;
    ISwapRouter02 public immutable ROUTER;

    /// Fee tier of the token/USDC pool. 0 means the token has no route and cannot be swapped.
    mapping(address => uint24) public routeFee;

    event RouteSet(address indexed token, uint24 fee);
    event BatchSwapped(address indexed user, uint256 tokenCount, uint256 usdcOut);

    error InvalidBatch();
    error ZeroAddress();
    error ZeroAmount();
    error DuplicateToken(address token);
    error TokenIsUSDC();
    error NoRoute(address token);
    error InvalidFee(uint24 fee);
    error Expired();

    constructor(address initialOwner, address router_, address usdc_, address permit2_) Ownable(initialOwner) {
        if (router_ == address(0) || usdc_ == address(0) || permit2_ == address(0)) revert ZeroAddress();
        ROUTER = ISwapRouter02(router_);
        USDC = IERC20(usdc_);
        PERMIT2 = IPermit2(permit2_);
    }

    /// Sets the pool fee tier for a token. Pass 0 to remove its route.
    function setRoute(address token, uint24 fee) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (token == address(USDC)) revert TokenIsUSDC();
        if (fee != 0 && fee != 100 && fee != 500 && fee != 3000 && fee != 10000) revert InvalidFee(fee);
        routeFee[token] = fee;
        emit RouteSet(token, fee);
    }

    /// `minOuts[i]` is the least USDC the user accepts for `tokens[i]`.
    /// Callers must always pass a real minimum calculated from the pool price.
    function batchSwap(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata minOuts,
        uint256 permitNonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant returns (uint256 usdcOut) {
        uint256 n = tokens.length;
        if (n == 0 || n > MAX_TOKENS || n != amounts.length || n != minOuts.length) revert InvalidBatch();
        if (block.timestamp > deadline) revert Expired();

        _validate(tokens, amounts);
        _pullTokens(tokens, amounts, permitNonce, deadline, signature);

        for (uint256 i; i < n; ++i) {
            usdcOut += _swap(tokens[i], amounts[i], minOuts[i]);
        }

        emit BatchSwapped(msg.sender, n, usdcOut);
    }

    function _swap(address token, uint256 amountIn, uint256 minOut) private returns (uint256) {
        IERC20(token).forceApprove(address(ROUTER), amountIn);
        uint256 out = ROUTER.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: token,
                tokenOut: address(USDC),
                fee: routeFee[token],
                recipient: msg.sender,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        IERC20(token).forceApprove(address(ROUTER), 0);
        return out;
    }

    function _validate(address[] calldata tokens, uint256[] calldata amounts) private view {
        uint256 n = tokens.length;
        for (uint256 i; i < n; ++i) {
            address t = tokens[i];
            if (t == address(0)) revert ZeroAddress();
            if (t == address(USDC)) revert TokenIsUSDC();
            if (amounts[i] == 0) revert ZeroAmount();
            if (routeFee[t] == 0) revert NoRoute(t);
            for (uint256 j; j < i; ++j) {
                if (tokens[j] == t) revert DuplicateToken(t);
            }
        }
    }

    function _pullTokens(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256 permitNonce,
        uint256 deadline,
        bytes calldata signature
    ) private {
        uint256 n = tokens.length;
        IPermit2.TokenPermissions[] memory permitted = new IPermit2.TokenPermissions[](n);
        IPermit2.SignatureTransferDetails[] memory details = new IPermit2.SignatureTransferDetails[](n);

        for (uint256 i; i < n; ++i) {
            permitted[i] = IPermit2.TokenPermissions(tokens[i], amounts[i]);
            details[i] = IPermit2.SignatureTransferDetails(address(this), amounts[i]);
        }

        PERMIT2.permitTransferFrom(
            IPermit2.PermitBatchTransferFrom(permitted, permitNonce, deadline),
            details,
            msg.sender,
            signature
        );
    }
}
