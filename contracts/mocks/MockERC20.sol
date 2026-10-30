// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice TEST ONLY: freely mintable token with an unrestricted transfer-fee setter.
/// @dev Not intended for production. Transfer fees are burned; minting is fee-free.
contract MockERC20 is ERC20 {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public feeBps;
    uint8 private immutable _tokenDecimals;

    error InvalidFeeBps();

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
    {
        _tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeBps(uint256 newFeeBps) external {
        if (newFeeBps > BPS_DENOMINATOR) revert InvalidFeeBps();
        feeBps = newFeeBps;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && feeBps != 0) {
            uint256 fee = Math.mulDiv(value, feeBps, BPS_DENOMINATOR);
            if (fee != 0) super._update(from, address(0), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}
