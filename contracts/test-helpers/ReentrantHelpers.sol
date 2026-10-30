// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IUniswapV2Router, HaganeBatchSwap} from "../HaganeBatchSwap.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TEST ONLY: router that re-enters batchSwap during the swap callback (bubbles the revert).
contract ReentrantRouter is IUniswapV2Router {
    HaganeBatchSwap public target;

    function setTarget(HaganeBatchSwap t) external {
        target = t;
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256, uint256, address[] calldata path, address, uint256
    ) external override {
        address[] memory t = new address[](1);
        t[0] = path[0];
        uint256[] memory a = new uint256[](1);
        a[0] = 1;
        target.batchSwap(t, a, 0, 999, block.timestamp + 1, "");
    }
}

/// @notice TEST ONLY: token that re-enters batchSwap from within a transfer (bubbles the revert).
contract ReentrantToken is ERC20 {
    HaganeBatchSwap public target;
    bool public armed;

    constructor() ERC20("Evil", "EVIL") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(HaganeBatchSwap t) external {
        target = t;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (armed && from != address(0) && to != address(0)) {
            armed = false;
            address[] memory ts = new address[](1);
            ts[0] = address(this);
            uint256[] memory a = new uint256[](1);
            a[0] = 1;
            target.batchSwap(ts, a, 0, 999, block.timestamp + 1, "");
        }
        super._update(from, to, value);
    }
}
