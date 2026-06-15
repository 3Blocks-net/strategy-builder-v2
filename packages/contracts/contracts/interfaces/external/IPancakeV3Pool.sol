// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IPancakeV3Pool
 * @notice Minimal read interface for a PancakeSwap V3 pool. `slot0().tick` gives
 *         the current tick directly (used by the Mint action's preset-width
 *         centering — cheaper than an off-chain log) and `tickSpacing` rounds the
 *         range outward to a valid grid. `observe` exposes the cumulative-tick
 *         oracle for time-weighted-average-tick (TWAP) reads — used by the
 *         Wick-&-Wait condition to ignore short wicks.
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

    /**
     * @notice Cumulative-tick oracle. For `secondsAgos = [W, 0]`, the mean tick
     *         over the last `W` seconds is `(tickCumulatives[1] - tickCumulatives[0]) / W`
     *         (round toward -infinity for negative results). Reverts if the pool's
     *         observation cardinality does not cover `W`.
     */
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (
            int56[] memory tickCumulatives,
            uint160[] memory secondsPerLiquidityCumulativeX128s
        );
}
