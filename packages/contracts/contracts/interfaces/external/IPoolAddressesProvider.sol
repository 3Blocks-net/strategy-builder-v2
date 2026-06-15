// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IPoolAddressesProvider
 * @notice Aave's canonical indirection contract. `getPool()` returns the stable
 *         Pool proxy (cached by AaveV3Registry at construction); `getPriceOracle()`
 *         returns the live oracle (resolved at execution time by the modes that
 *         need it — never cached, so an Aave oracle re-point is followed).
 */
interface IPoolAddressesProvider {
    function getPool() external view returns (address);

    function getPriceOracle() external view returns (address);
}
