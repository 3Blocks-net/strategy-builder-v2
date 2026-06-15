// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/external/IPoolAddressesProvider.sol";
import "../interfaces/external/IAaveV3Pool.sol";

/**
 * @title AaveV3Registry
 * @notice Per-protocol address registry for the Aave V3 actions. Stores the
 *         `PoolAddressesProvider` (Aave's own canonical indirection) as an
 *         `immutable` and resolves + caches the `Pool` (a stable proxy) in the
 *         constructor.
 *
 *         The price oracle is **not** cached: it is resolved at execution time
 *         via `provider.getPriceOracle()` so an Aave governance oracle re-point
 *         is followed automatically and the HF math reads the *same* oracle Aave
 *         uses internally. See PRD §Contract architecture.
 *
 *         Immutable by design — no owner, no setters. Re-targeting a chain means
 *         deploying a new registry and repointing the actions.
 */
contract AaveV3Registry {
    /// Aave's PoolAddressesProvider (e.g. BSC `0xff75…`).
    IPoolAddressesProvider public immutable addressesProvider;

    /// Cached Pool proxy resolved from the provider at construction.
    IAaveV3Pool public immutable pool;

    error ZeroAddress();

    constructor(address addressesProvider_) {
        if (addressesProvider_ == address(0)) revert ZeroAddress();
        addressesProvider = IPoolAddressesProvider(addressesProvider_);

        address resolvedPool = IPoolAddressesProvider(addressesProvider_).getPool();
        if (resolvedPool == address(0)) revert ZeroAddress();
        pool = IAaveV3Pool(resolvedPool);
    }

    /**
     * The live Aave price oracle, resolved at call time (never cached). Only the
     * MAX_AVAILABLE / TARGET_HF modes need it.
     */
    function priceOracle() external view returns (address) {
        return addressesProvider.getPriceOracle();
    }
}
