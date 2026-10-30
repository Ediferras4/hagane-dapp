// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {HaganeBatchSwap} from "../HaganeBatchSwap.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockV2Router} from "../mocks/MockV2Router.sol";
import {MockPermit2} from "../mocks/MockPermit2.sol";
import {ReentrantRouter, ReentrantToken} from "../test-helpers/ReentrantHelpers.sol";

contract HaganeBatchSwapTest is Test {
    HaganeBatchSwap internal swap;
    MockERC20 internal usdc;
    MockV2Router internal router;
    MockPermit2 internal permit2;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant RATE_DEN = 1e12; // token i pays (i+1) * 1e-12 USDC-units per token-unit
    uint256 internal constant AMT = 10e18;
    uint256 internal deadline;
    uint256 internal salt;

    event RouterUpdated(address indexed oldRouter, address indexed newRouter);
    event BatchSwapped(address indexed user, uint256 tokenCount, uint256 usdcOut);

    function setUp() public {
        vm.warp(1_000_000);
        deadline = block.timestamp + 1 hours;
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        router = new MockV2Router();
        permit2 = new MockPermit2();
        usdc.mint(address(router), 1e40);
        swap = new HaganeBatchSwap(owner, address(router), address(usdc), address(permit2));
    }

    // ---------- helpers ----------

    function _newToken(uint256 idx, uint256 amt) internal returns (MockERC20 t) {
        t = new MockERC20("T", "T", 18);
        t.mint(alice, amt);
        vm.prank(alice);
        t.approve(address(permit2), type(uint256).max);
        router.setRate(address(t), idx + 1, RATE_DEN);
    }

    function _mk(uint256 n, uint256 amt) internal returns (address[] memory t, uint256[] memory a) {
        a = new uint256[](n);
        for (uint256 i; i < n; ++i) a[i] = amt;
        t = _mkAmts(a);
    }

    function _mkAmts(uint256[] memory a) internal returns (address[] memory t) {
        t = new address[](a.length);
        for (uint256 i; i < a.length; ++i) t[i] = address(_newToken(i, a[i]));
    }

    function _out(uint256[] memory a) internal pure returns (uint256 s) {
        for (uint256 i; i < a.length; ++i) s += a[i] * (i + 1) / RATE_DEN;
    }

    function _swapFull(address[] memory t, uint256[] memory a, uint256 minOut, uint256 nonce, uint256 dl)
        internal
        returns (uint256)
    {
        vm.prank(alice);
        return swap.batchSwap(t, a, minOut, nonce, dl, "");
    }

    function _swap(address[] memory t, uint256[] memory a, uint256 minOut) internal returns (uint256) {
        return _swapFull(t, a, minOut, 0, deadline);
    }

    function _assertEmpty(address[] memory t) internal view {
        for (uint256 i; i < t.length; ++i) {
            assertEq(MockERC20(t[i]).balanceOf(address(swap)), 0, "token left in swap");
            assertEq(MockERC20(t[i]).allowance(address(swap), address(router)), 0, "allowance left");
        }
        assertEq(usdc.balanceOf(address(swap)), 0, "usdc left in swap");
    }

    function _assertAliceKeeps(address[] memory t, uint256[] memory a) internal view {
        for (uint256 i; i < t.length; ++i) assertEq(MockERC20(t[i]).balanceOf(alice), a[i], "tokens moved");
        assertEq(usdc.balanceOf(alice), 0);
    }

    // ---------- constructor ----------

    function test_ConstructorStoresConfigAndEmits() public {
        vm.expectEmit(true, true, false, false);
        emit RouterUpdated(address(0), address(router));
        HaganeBatchSwap s = new HaganeBatchSwap(owner, address(router), address(usdc), address(permit2));
        assertEq(s.owner(), owner);
        assertEq(address(s.router()), address(router));
        assertEq(address(s.USDC()), address(usdc));
        assertEq(address(s.PERMIT2()), address(permit2));
        assertEq(s.MAX_TOKENS(), 10);
    }

    function test_RevertConstructorZeroRouter() public {
        vm.expectRevert(HaganeBatchSwap.ZeroAddress.selector);
        new HaganeBatchSwap(owner, address(0), address(usdc), address(permit2));
    }

    function test_RevertConstructorZeroUsdc() public {
        vm.expectRevert(HaganeBatchSwap.ZeroAddress.selector);
        new HaganeBatchSwap(owner, address(router), address(0), address(permit2));
    }

    function test_RevertConstructorZeroPermit2() public {
        vm.expectRevert(HaganeBatchSwap.ZeroAddress.selector);
        new HaganeBatchSwap(owner, address(router), address(usdc), address(0));
    }

    function test_RevertConstructorZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new HaganeBatchSwap(address(0), address(router), address(usdc), address(permit2));
    }

    // ---------- batchSwap happy path ----------

    function _happy(uint256 n) internal {
        (address[] memory t, uint256[] memory a) = _mk(n, AMT);
        uint256 expected = _out(a);
        assertGt(expected, 0);

        vm.expectEmit(true, false, false, true, address(swap));
        emit BatchSwapped(alice, n, expected);
        uint256 ret = _swap(t, a, expected);

        assertEq(ret, expected, "return value");
        assertEq(usdc.balanceOf(alice), expected, "usdc delivered to caller");
        for (uint256 i; i < n; ++i) {
            assertEq(MockERC20(t[i]).balanceOf(alice), 0, "alice tokens spent");
            assertEq(MockERC20(t[i]).balanceOf(address(router)), a[i], "router got tokens");
        }
        _assertEmpty(t);
        assertTrue(permit2.usedNonces(alice, 0));
    }

    function test_BatchSwap_OneToken() public {
        _happy(1);
    }

    function test_BatchSwap_FiveTokens() public {
        _happy(5);
    }

    function test_BatchSwap_TenTokens() public {
        _happy(10);
    }

    function test_BatchSwap_DeadlineEqualToTimestampPasses() public {
        (address[] memory t, uint256[] memory a) = _mk(1, AMT);
        uint256 ret = _swapFull(t, a, 0, 0, block.timestamp);
        assertEq(ret, _out(a));
    }

    function test_BatchSwap_DonatedBalancesNotSweptToCaller() public {
        (address[] memory t, uint256[] memory a) = _mk(2, AMT);
        MockERC20(t[0]).mint(address(swap), 3e18);
        usdc.mint(address(swap), 7e6);
        uint256 ret = _swap(t, a, 0);
        assertEq(ret, _out(a));
        assertEq(usdc.balanceOf(alice), _out(a));
        assertEq(usdc.balanceOf(address(swap)), 7e6, "donated usdc stays");
        assertEq(MockERC20(t[0]).balanceOf(address(swap)), 3e18, "donated token stays");
    }

    // ---------- slippage ----------

    function test_MinUsdcOutExactlyMetPasses() public {
        (address[] memory t, uint256[] memory a) = _mk(3, AMT);
        uint256 out = _out(a);
        assertEq(_swap(t, a, out), out);
        assertEq(usdc.balanceOf(alice), out);
    }

    function test_RevertSlippageOneWeiAbove_CallerKeepsTokens() public {
        (address[] memory t, uint256[] memory a) = _mk(3, AMT);
        uint256 out = _out(a);
        vm.expectRevert(abi.encodeWithSelector(HaganeBatchSwap.SlippageExceeded.selector, out, out + 1));
        _swap(t, a, out + 1);
        _assertAliceKeeps(t, a);
        _assertEmpty(t);
        assertFalse(permit2.usedNonces(alice, 0), "nonce not burned on revert");
    }

    // ---------- batch validation ----------

    function test_RevertElevenTokens() public {
        (address[] memory t, uint256[] memory a) = _mk(11, AMT);
        vm.expectRevert(HaganeBatchSwap.InvalidBatch.selector);
        _swap(t, a, 0);
    }

    function test_RevertEmptyBatch() public {
        vm.expectRevert(HaganeBatchSwap.InvalidBatch.selector);
        _swap(new address[](0), new uint256[](0), 0);
    }

    function test_RevertLengthMismatch() public {
        (address[] memory t,) = _mk(2, AMT);
        vm.expectRevert(HaganeBatchSwap.InvalidBatch.selector);
        _swap(t, new uint256[](1), 0);
        vm.expectRevert(HaganeBatchSwap.InvalidBatch.selector);
        _swap(t, new uint256[](3), 0);
    }

    function test_RevertDuplicateToken() public {
        (address[] memory t, uint256[] memory a) = _mk(3, AMT);
        t[2] = t[0];
        vm.expectRevert(abi.encodeWithSelector(HaganeBatchSwap.DuplicateToken.selector, t[0]));
        _swap(t, a, 0);
    }

    function test_RevertZeroToken() public {
        (address[] memory t, uint256[] memory a) = _mk(2, AMT);
        t[1] = address(0);
        vm.expectRevert(HaganeBatchSwap.ZeroAddress.selector);
        _swap(t, a, 0);
    }

    function test_RevertZeroAmount() public {
        (address[] memory t, uint256[] memory a) = _mk(2, AMT);
        a[1] = 0;
        vm.expectRevert(HaganeBatchSwap.ZeroAmount.selector);
        _swap(t, a, 0);
    }

    function test_RevertUsdcAsInput() public {
        (address[] memory t, uint256[] memory a) = _mk(2, AMT);
        t[1] = address(usdc);
        vm.expectRevert(HaganeBatchSwap.TokenIsUSDC.selector);
        _swap(t, a, 0);
    }

    function test_RevertExpiredDeadline() public {
        (address[] memory t, uint256[] memory a) = _mk(1, AMT);
        vm.expectRevert(HaganeBatchSwap.Expired.selector);
        _swapFull(t, a, 0, 0, block.timestamp - 1);
        _assertAliceKeeps(t, a);
    }

    function test_RevertReplayedPermitNonce() public {
        (address[] memory t, uint256[] memory a) = _mk(1, AMT);
        _swapFull(t, a, 0, 7, deadline);
        MockERC20(t[0]).mint(alice, AMT); // refund so only the nonce can fail
        vm.expectRevert(MockPermit2.InvalidNonce.selector);
        _swapFull(t, a, 0, 7, deadline);
        assertEq(MockERC20(t[0]).balanceOf(alice), AMT);
    }

    function test_RevertNoRateForTokenRevertsWholeBatch() public {
        (address[] memory t, uint256[] memory a) = _mk(2, AMT);
        MockERC20 noPool = new MockERC20("N", "N", 18);
        noPool.mint(alice, AMT);
        vm.prank(alice);
        noPool.approve(address(permit2), type(uint256).max);
        t[1] = address(noPool);
        vm.expectRevert(abi.encodeWithSelector(MockV2Router.RateNotSet.selector, address(noPool)));
        _swap(t, a, 0);
        assertEq(MockERC20(t[0]).balanceOf(alice), AMT, "first token not consumed");
        assertEq(noPool.balanceOf(alice), AMT);
        assertEq(usdc.balanceOf(alice), 0);
    }

    // ---------- fee-on-transfer ----------

    function test_FeeOnTransferSwapsActualReceivedAmount() public {
        MockERC20 fot = _newToken(0, 100e18);
        fot.setFeeBps(1000); // 10% burned on every transfer
        address[] memory t = new address[](1);
        t[0] = address(fot);
        uint256[] memory a = new uint256[](1);
        a[0] = 100e18;
        // 100 -> 90 reaches HaganeBatchSwap; 90 -> 81 reaches router (second fee hop).
        uint256 expected = 81e18 / RATE_DEN;
        vm.expectEmit(true, false, false, true, address(swap));
        emit BatchSwapped(alice, 1, expected);
        uint256 ret = _swap(t, a, expected);
        assertEq(ret, expected);
        assertEq(usdc.balanceOf(alice), expected);
        assertEq(fot.balanceOf(alice), 0);
        _assertEmpty(t);
    }

    function test_FeeOnTransferMixedWithNormalToken() public {
        MockERC20 fot = _newToken(0, 100e18);
        fot.setFeeBps(500);
        MockERC20 normal = _newToken(1, 50e18);
        address[] memory t = new address[](2);
        t[0] = address(fot);
        t[1] = address(normal);
        uint256[] memory a = new uint256[](2);
        a[0] = 100e18;
        a[1] = 50e18;
        // fot: 100 -> 95 -> 90.25 at router; normal: 50 * 2
        uint256 expected = uint256(90.25e18) / RATE_DEN + (50e18 * 2) / RATE_DEN;
        assertEq(_swap(t, a, expected), expected);
        _assertEmpty(t);
    }

    function test_RevertNothingReceivedWhenFeeIs100Percent() public {
        MockERC20 fot = _newToken(0, AMT);
        fot.setFeeBps(10_000);
        address[] memory t = new address[](1);
        t[0] = address(fot);
        uint256[] memory a = new uint256[](1);
        a[0] = AMT;
        vm.expectRevert(abi.encodeWithSelector(HaganeBatchSwap.NothingReceived.selector, address(fot)));
        _swap(t, a, 0);
        assertEq(fot.balanceOf(alice), AMT);
    }

    // ---------- setRouter ----------

    function test_SetRouterUpdatesAndEmits() public {
        address newRouter = makeAddr("newRouter");
        vm.expectEmit(true, true, false, false, address(swap));
        emit RouterUpdated(address(router), newRouter);
        vm.prank(owner);
        swap.setRouter(newRouter);
        assertEq(address(swap.router()), newRouter);
    }

    function test_SetRouterIsUsedBySubsequentSwaps() public {
        MockV2Router r2 = new MockV2Router();
        usdc.mint(address(r2), 1e30);
        vm.prank(owner);
        swap.setRouter(address(r2));
        (address[] memory t, uint256[] memory a) = _mk(1, AMT);
        r2.setRate(t[0], 3, RATE_DEN);
        uint256 ret = _swap(t, a, 0);
        assertEq(ret, AMT * 3 / RATE_DEN);
        assertEq(MockERC20(t[0]).balanceOf(address(r2)), AMT);
        assertEq(MockERC20(t[0]).balanceOf(address(router)), 0);
    }

    function test_RevertSetRouterNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        swap.setRouter(makeAddr("r"));
    }

    function test_RevertSetRouterZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(HaganeBatchSwap.ZeroAddress.selector);
        swap.setRouter(address(0));
    }

    // ---------- Ownable2Step ----------

    function test_Ownable2StepTransferAndAccept() public {
        vm.expectEmit(true, true, false, false, address(swap));
        emit Ownable2Step.OwnershipTransferStarted(owner, bob);
        vm.prank(owner);
        swap.transferOwnership(bob);
        assertEq(swap.owner(), owner, "owner unchanged until accept");
        assertEq(swap.pendingOwner(), bob);

        vm.expectEmit(true, true, false, false, address(swap));
        emit Ownable.OwnershipTransferred(owner, bob);
        vm.prank(bob);
        swap.acceptOwnership();
        assertEq(swap.owner(), bob);
        assertEq(swap.pendingOwner(), address(0));

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        swap.setRouter(makeAddr("r"));
        vm.prank(bob);
        swap.setRouter(makeAddr("r"));
    }

    function test_RevertAcceptOwnershipByNonPending() public {
        vm.prank(owner);
        swap.transferOwnership(bob);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        swap.acceptOwnership();
    }

    function test_RevertTransferOwnershipNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        swap.transferOwnership(alice);
    }

    // ---------- reentrancy ----------

    function test_RevertReentrancyViaMaliciousRouter() public {
        ReentrantRouter evil = new ReentrantRouter();
        evil.setTarget(swap);
        vm.prank(owner);
        swap.setRouter(address(evil));
        (address[] memory t, uint256[] memory a) = _mk(1, AMT);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _swap(t, a, 0);
        _assertAliceKeeps(t, a);
    }

    function test_RevertReentrancyViaMaliciousToken() public {
        ReentrantToken evil = new ReentrantToken();
        evil.mint(alice, AMT);
        vm.prank(alice);
        evil.approve(address(permit2), type(uint256).max);
        router.setRate(address(evil), 1, RATE_DEN);
        evil.arm(swap);
        address[] memory t = new address[](1);
        t[0] = address(evil);
        uint256[] memory a = new uint256[](1);
        a[0] = AMT;
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _swap(t, a, 0);
        assertEq(evil.balanceOf(alice), AMT);
    }

    // ---------- fuzz ----------

    function _fuzzAmts(uint256 nSeed, uint256 seed) internal pure returns (uint256[] memory a) {
        a = new uint256[](bound1(nSeed, 1, 10));
        for (uint256 i; i < a.length; ++i) a[i] = bound1(uint256(keccak256(abi.encode(seed, i))), 1, 1e27);
    }

    function bound1(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        return lo + (x % (hi - lo + 1));
    }

    function testFuzz_BatchPaysMockRatesAndLeavesNothing(uint256 nSeed, uint256 seed) public {
        uint256[] memory a = _fuzzAmts(nSeed, seed);
        address[] memory t = _mkAmts(a);
        uint256 expected = _out(a);
        vm.expectEmit(true, false, false, true, address(swap));
        emit BatchSwapped(alice, a.length, expected);
        assertEq(_swap(t, a, expected), expected);
        assertEq(usdc.balanceOf(alice), expected);
        _assertEmpty(t);
    }

    function testFuzz_MinUsdcOutBelowOrEqualPasses(uint256 nSeed, uint256 seed, uint256 minOut) public {
        uint256[] memory a = _fuzzAmts(nSeed, seed);
        address[] memory t = _mkAmts(a);
        uint256 expected = _out(a);
        minOut = bound(minOut, 0, expected);
        assertEq(_swap(t, a, minOut), expected);
    }

    function testFuzz_MinUsdcOutAboveRevertsAndCallerKeepsTokens(uint256 nSeed, uint256 seed, uint256 extra) public {
        uint256[] memory a = _fuzzAmts(nSeed, seed);
        address[] memory t = _mkAmts(a);
        uint256 expected = _out(a);
        uint256 minOut = expected + bound(extra, 1, type(uint128).max);
        vm.expectRevert(abi.encodeWithSelector(HaganeBatchSwap.SlippageExceeded.selector, expected, minOut));
        _swap(t, a, minOut);
        _assertAliceKeeps(t, a);
        _assertEmpty(t);
    }

    function testFuzz_FeeOnTransferNeverStrandsTokens(uint256 amt, uint256 feeBps) public {
        amt = bound(amt, 1e12, 1e27);
        feeBps = bound(feeBps, 0, 5_000);
        MockERC20 fot = _newToken(0, amt);
        fot.setFeeBps(feeBps);
        address[] memory t = new address[](1);
        t[0] = address(fot);
        uint256[] memory a = new uint256[](1);
        a[0] = amt;
        _swap(t, a, 0);
        _assertEmpty(t);
        assertEq(fot.balanceOf(alice), 0);
    }
}
