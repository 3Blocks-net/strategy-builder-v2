// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IPancakeV3Pool
 * @notice Minimal read interface for a PancakeSwap V3 pool. `slot0().tick` gives
 *         the current tick directly (used by the Mint action's preset-width
 *         centering — cheaper than an off-chain log) and `tickSpacing` rounds the
 *         range outward to a valid grid.
 */
interface IPancakeV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint32 feeProtocol,
            bool unlocked
        );

    function tickSpacing() external view returns (int24);

    function token0() external view returns (address);

    function token1() external view returns (address);
}
