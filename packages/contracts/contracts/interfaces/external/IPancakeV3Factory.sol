// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IPancakeV3Factory
 * @notice PancakeSwap V3 factory — `getPool` resolves the pool for a token pair
 *         and fee tier (returns address(0) when none exists). Used by the
 *         frontend's pre-deploy pool-existence validity check.
 */
interface IPancakeV3Factory {
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool);
}
