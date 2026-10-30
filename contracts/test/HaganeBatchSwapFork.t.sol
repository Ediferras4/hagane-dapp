// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {HaganeBatchSwap} from "../HaganeBatchSwap.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockV2Router} from "../mocks/MockV2Router.sol";

interface IPermit2Domain {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function nonceBitmap(address, uint256) external view returns (uint256);
}

/// @notice Fork-only checks against the REAL Permit2 predeploy on Arc Testnet.
/// Skipped (vm.skip) unless ARC_TESTNET_RPC_URL (or ARC_TESTNET_RPC) is set.
/// Uses mock tokens + a mock router; USDC is a mock passed via constructor so the
/// real Arc USDC predeploy is not needed.
contract HaganeBatchSwapForkTest is Test {
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    bytes32 internal constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 internal constant PERMIT_BATCH_TRANSFER_FROM_TYPEHASH = keccak256(
        "PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    );

    HaganeBatchSwap internal swap;
    MockERC20 internal usdc;
    MockV2Router internal router;
    uint256 internal userPk;
    address internal user;

    function setUp() public {
        string memory url = vm.envOr("ARC_TESTNET_RPC_URL", string(""));
        if (bytes(url).length == 0) url = vm.envOr("ARC_TESTNET_RPC", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);
        (user, userPk) = makeAddrAndKey("forkUser");
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        router = new MockV2Router();
        usdc.mint(address(router), 1e30);
        swap = new HaganeBatchSwap(makeAddr("owner"), address(router), address(usdc), PERMIT2);
    }

    function _sign(address[] memory t, uint256[] memory a, uint256 nonce, uint256 dl, address spender)
        internal
        view
        returns (bytes memory)
    {
        bytes32[] memory h = new bytes32[](t.length);
        for (uint256 i; i < t.length; ++i) {
            h[i] = keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, t[i], a[i]));
        }
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_BATCH_TRANSFER_FROM_TYPEHASH, keccak256(abi.encodePacked(h)), spender, nonce, dl
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IPermit2Domain(PERMIT2).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _tokens(uint256 n, uint256 amt) internal returns (address[] memory t, uint256[] memory a) {
        t = new address[](n);
        a = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            MockERC20 tk = new MockERC20("T", "T", 18);
            tk.mint(user, amt);
            vm.prank(user);
            tk.approve(PERMIT2, type(uint256).max);
            router.setRate(address(tk), i + 1, 1e12);
            t[i] = address(tk);
            a[i] = amt;
        }
    }

    function test_Fork_Permit2PredeployExists() public view {
        assertGt(PERMIT2.code.length, 0, "Permit2 predeploy missing");
    }

    function test_Fork_RealPermit2BatchSignatureSwaps() public {
        (address[] memory t, uint256[] memory a) = _tokens(3, 10e18);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(t, a, 1, dl, address(swap));
        uint256 expected = 10e18 * (1 + 2 + 3) / 1e12;

        vm.prank(user);
        uint256 out = swap.batchSwap(t, a, expected, 1, dl, sig);

        assertEq(out, expected);
        assertEq(usdc.balanceOf(user), expected);
        assertEq(usdc.balanceOf(address(swap)), 0);
        for (uint256 i; i < t.length; ++i) {
            assertEq(MockERC20(t[i]).balanceOf(user), 0);
            assertEq(MockERC20(t[i]).balanceOf(address(swap)), 0);
        }
    }

    function test_Fork_RealPermit2RejectsReplayedNonce() public {
        (address[] memory t, uint256[] memory a) = _tokens(1, 10e18);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(t, a, 5, dl, address(swap));
        vm.prank(user);
        swap.batchSwap(t, a, 0, 5, dl, sig);

        MockERC20(t[0]).mint(user, 10e18);
        vm.prank(user);
        vm.expectRevert(); // Permit2 InvalidNonce()
        swap.batchSwap(t, a, 0, 5, dl, sig);
    }

    function test_Fork_RealPermit2RejectsSignatureForWrongSpender() public {
        (address[] memory t, uint256[] memory a) = _tokens(1, 10e18);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(t, a, 2, dl, makeAddr("someoneElse"));
        vm.prank(user);
        vm.expectRevert(); // Permit2 InvalidSigner()
        swap.batchSwap(t, a, 0, 2, dl, sig);
        assertEq(MockERC20(t[0]).balanceOf(user), 10e18);
    }

    function test_Fork_RealPermit2RejectsTamperedAmounts() public {
        (address[] memory t, uint256[] memory a) = _tokens(1, 10e18);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(t, a, 3, dl, address(swap));
        a[0] = 9e18; // differs from what was signed
        vm.prank(user);
        vm.expectRevert(); // Permit2 InvalidSigner()
        swap.batchSwap(t, a, 0, 3, dl, sig);
    }
}
