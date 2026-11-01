// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {HaganeBatchSwapV5} from "../HaganeBatchSwapV5.sol";

interface IERC20Min {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IPermit2Domain {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// Runs against the REAL Arc mainnet state: the deployed contract, the real EURC,
/// the real SwapRouter02 and the real USDC/EURC pool. Nothing is sent to the chain.
contract HaganeBatchSwapV5ForkTest is Test {
    address constant DEPLOYED = 0x52e13F07aA08EEC78751F7fd2bA7171BF1e720FC;
    address constant OWNER = 0x584b3BFa665Ba812Aa2252D9Ff38a3B678D41d7E;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;
    address constant WETH = 0x128cC466B61f542da60c70e3aA11c10e19B84EDB;

    bytes32 constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 constant PERMIT_BATCH_TYPEHASH = keccak256(
        "PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    );

    HaganeBatchSwapV5 swap;
    uint256 userPk;
    address user;

    function setUp() public {
        vm.createSelectFork("arc");
        swap = HaganeBatchSwapV5(DEPLOYED);
        (user, userPk) = makeAddrAndKey("forkUser");

        // Simulated on the fork only: the owner sets the EURC route with fee 500.
        vm.prank(OWNER);
        swap.setRoute(EURC, 500);

        // 1.2 EURC (6 decimals) for the test user, and approval of EURC to Permit2.
        deal(EURC, user, 1_200_000);
        vm.prank(user);
        IERC20Min(EURC).approve(PERMIT2, type(uint256).max);
    }

    function _sign(address[] memory tokens, uint256[] memory amounts, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32[] memory hashes = new bytes32[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            hashes[i] = keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, tokens[i], amounts[i]));
        }
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_BATCH_TYPEHASH, keccak256(abi.encodePacked(hashes)), DEPLOYED, nonce, deadline)
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", IPermit2Domain(PERMIT2).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _one(address token, uint256 amount) internal pure returns (address[] memory t, uint256[] memory a) {
        t = new address[](1);
        a = new uint256[](1);
        t[0] = token;
        a[0] = amount;
    }

    function test_SwapEurcToUsdcAtRealPrice() public {
        (address[] memory t, uint256[] memory a) = _one(EURC, 1_200_000);
        uint256[] memory minOuts = new uint256[](1);
        minOuts[0] = 1; // any real output passes this; the real minimum comes from the app later
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(t, a, 111, deadline);

        uint256 usdcBefore = IERC20Min(USDC).balanceOf(user);
        vm.prank(user);
        swap.batchSwap(t, a, minOuts, 111, deadline, sig);
        uint256 received = IERC20Min(USDC).balanceOf(user) - usdcBefore;

        // 1.2 EURC should be worth roughly 1.3 USDC, so more than 1 USDC must come back.
        assertGt(received, 1_000_000, "received less than 1 USDC");
        assertEq(IERC20Min(EURC).balanceOf(user), 0, "EURC not fully spent");
        assertEq(IERC20Min(USDC).balanceOf(DEPLOYED), 0, "contract kept USDC");
        assertEq(IERC20Min(EURC).balanceOf(DEPLOYED), 0, "contract kept EURC");
    }

    function test_RevertWhenMinOutIsTooHigh() public {
        (address[] memory t, uint256[] memory a) = _one(EURC, 1_200_000);
        uint256[] memory minOuts = new uint256[](1);
        minOuts[0] = 100_000_000; // 100 USDC, impossible for 1.2 EURC
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(t, a, 222, deadline);

        vm.prank(user);
        vm.expectRevert();
        swap.batchSwap(t, a, minOuts, 222, deadline, sig);
        assertEq(IERC20Min(EURC).balanceOf(user), 1_200_000, "tokens moved despite revert");
    }

    function test_RevertForTokenWithoutRoute() public {
        (address[] memory t, uint256[] memory a) = _one(WETH, 1e15);
        uint256[] memory minOuts = new uint256[](1);
        minOuts[0] = 1;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(t, a, 333, deadline);

        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(HaganeBatchSwapV5.NoRoute.selector, WETH));
        swap.batchSwap(t, a, minOuts, 333, deadline, sig);
    }

    function test_RevertOnReplayedNonce() public {
        (address[] memory t, uint256[] memory a) = _one(EURC, 1_200_000);
        uint256[] memory minOuts = new uint256[](1);
        minOuts[0] = 1;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(t, a, 444, deadline);

        vm.prank(user);
        swap.batchSwap(t, a, minOuts, 444, deadline, sig);

        deal(EURC, user, 1_200_000); // fund again, so only the nonce can stop the second call
        vm.prank(user);
        vm.expectRevert();
        swap.batchSwap(t, a, minOuts, 444, deadline, sig);
    }

    function test_RevertWhenAmountIsTampered() public {
        (address[] memory t, uint256[] memory a) = _one(EURC, 1_200_000);
        uint256[] memory minOuts = new uint256[](1);
        minOuts[0] = 1;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(t, a, 555, deadline);

        (, uint256[] memory tampered) = _one(EURC, 1_000_000); // signed for 1.2, submitted for 1.0
        vm.prank(user);
        vm.expectRevert();
        swap.batchSwap(t, tampered, minOuts, 555, deadline, sig);
    }
}
