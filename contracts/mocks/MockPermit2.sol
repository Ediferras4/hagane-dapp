// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPermit2} from "../HaganeBatchSwap.sol";

/// @notice TEST ONLY: batch-transfer stand-in that DOES NOT verify signatures.
/// @dev Never use in production: anyone can spend an owner's allowances to this mock.
/// This exercises batch transfers and unordered nonce consumption, not EIP-712 security.
contract MockPermit2 is IPermit2 {
    using SafeERC20 for IERC20;

    mapping(address owner => mapping(uint256 nonce => bool used)) public usedNonces;

    error SignatureExpired(uint256 signatureDeadline);
    error InvalidNonce();
    error LengthMismatch();
    error InvalidAmount(uint256 maxAmount);

    function permitTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata transferDetails,
        address owner,
        bytes calldata /* signature: deliberately ignored in this test-only mock */
    ) external override {
        if (block.timestamp > permit.deadline) revert SignatureExpired(permit.deadline);
        if (permit.permitted.length != transferDetails.length) revert LengthMismatch();
        if (usedNonces[owner][permit.nonce]) revert InvalidNonce();
        usedNonces[owner][permit.nonce] = true;

        for (uint256 i; i < permit.permitted.length; ++i) {
            uint256 requested = transferDetails[i].requestedAmount;
            if (requested > permit.permitted[i].amount) revert InvalidAmount(permit.permitted[i].amount);
            if (requested != 0) {
                IERC20(permit.permitted[i].token).safeTransferFrom(owner, transferDetails[i].to, requested);
            }
        }
    }
}
