// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal interface for verifying that a vault was created by a trusted factory.
interface IVaultRegistry {
    /// @notice Returns true when `vault` was deployed by this factory.
    function isRegisteredVault(address vault) external view returns (bool);
}
