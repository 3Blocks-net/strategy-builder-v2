// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IAaveOracle
 * @notice Aave's price oracle. `getAssetPrice` returns the asset price in the
 *         pool's base currency (USD, 8 decimals on BSC). Resolved at execution
 *         time via the PoolAddressesProvider — never cached — so the action
 *         reads the same oracle Aave uses internally for the health factor.
 */
interface IAaveOracle {
    function getAssetPrice(address asset) external view returns (uint256);
}
