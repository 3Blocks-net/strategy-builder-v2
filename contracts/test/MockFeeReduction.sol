// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/external/IFeeReduction.sol";

/**
 * @title MockFeeReduction
 * @notice Minimal IFeeReduction implementation for tests.
 *         Reductions are set manually via setFeeReduction().
 *         Returns 0 (no reduction) when no value has been set for a wallet.
 */
contract MockFeeReduction is IFeeReduction {
    mapping(address => uint256) private _reductions;

    /// @notice Set the fee reduction in basis points (0–10_000) for a wallet.
    function setFeeReduction(address wallet, uint256 reductionBps) external {
        _reductions[wallet] = reductionBps;
    }

    /// @inheritdoc IFeeReduction
    function getFeeReduction(address wallet) external view override returns (uint256) {
        return _reductions[wallet];
    }
}
