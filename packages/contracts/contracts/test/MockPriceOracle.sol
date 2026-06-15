// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/external/IPriceOracle.sol";

/**
 * @title MockPriceOracle
 * @notice Minimal IPriceOracle implementation for tests.
 *         Prices are set manually via setPrice(). Returns 18-decimal USD prices.
 *         Reverts with OracleNotExist when no price is set for a token.
 */
contract MockPriceOracle is IPriceOracle {
    mapping(address => uint256) private _prices;

    /// @notice Set the USD price (18 decimals) for a token.
    function setPrice(address token, uint256 priceUSD) external {
        _prices[token] = priceUSD;
    }

    /// @inheritdoc IPriceOracle
    function getTokenPrice(address token) external view override returns (uint256) {
        uint256 price = _prices[token];
        if (price == 0) revert OracleNotExist(token);
        return price;
    }

    /// @inheritdoc IPriceOracle
    function PRICE_DECIMALS() external pure override returns (uint8) {
        return 18;
    }

    // ── Unused admin functions (no-op in mock) ────────────────────────────────

    function setOracleID(address, bytes32) external override {}

    function oracleID(address) external pure override returns (bytes32) {
        return bytes32(0);
    }
}
