// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../libraries/TickMath.sol";

/// @dev Test-only wrapper exposing the internal TickMath library for unit tests.
contract TickMathHarness {
    function getSqrtRatioAtTick(int24 tick) external pure returns (uint160) {
        return TickMath.getSqrtRatioAtTick(tick);
    }
}
