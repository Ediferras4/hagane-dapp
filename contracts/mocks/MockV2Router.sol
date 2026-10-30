// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IUniswapV2Router} from "../HaganeBatchSwap.sol";

/// @notice TEST ONLY: fixed-rate router with unrestricted rate configuration.
/// @dev Not a real AMM. Prefund this contract with the output token (normally USDC).
/// Rates use raw token units, with no automatic decimal normalization.
contract MockV2Router is IUniswapV2Router {
    using SafeERC20 for IERC20;

    struct Rate {
        uint256 numerator;
        uint256 denominator;
    }

    mapping(address token => Rate rate) public rates;

    error InvalidRate();
    error RateNotSet(address token);
    error InvalidPath();
    error Expired();
    error InsufficientOutput(uint256 received, uint256 minimum);

    function setRate(address token, uint256 numerator, uint256 denominator) external {
        if (token == address(0) || numerator == 0 || denominator == 0) revert InvalidRate();
        rates[token] = Rate(numerator, denominator);
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override {
        if (block.timestamp > deadline) revert Expired();
        if (path.length < 2 || path[0] == address(0) || path[path.length - 1] == address(0)) {
            revert InvalidPath();
        }
        Rate memory rate = rates[path[0]];
        if (rate.denominator == 0) revert RateNotSet(path[0]);

        IERC20 input = IERC20(path[0]);
        uint256 beforeInput = input.balanceOf(address(this));
        input.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 received = input.balanceOf(address(this)) - beforeInput;
        uint256 amountOut = Math.mulDiv(received, rate.numerator, rate.denominator);

        IERC20 output = IERC20(path[path.length - 1]);
        uint256 beforeOutput = output.balanceOf(to);
        output.safeTransfer(to, amountOut);
        uint256 delivered = output.balanceOf(to) - beforeOutput;
        if (delivered < amountOutMin) revert InsufficientOutput(delivered, amountOutMin);
    }
}
