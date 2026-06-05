// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Test-only action that always reverts with a known custom error,
///         so tests can assert the vault re-reverts `ActionExecutionFailed`
///         carrying the ORIGINAL revert bytes (PEC-219 slice #02). The revert
///         `code` is read from the encoded params to make the reason
///         deterministic and decodable.
contract MockRevertingAction {
    error MockActionReason(uint256 code);

    function execute(bytes calldata params, bytes[] calldata)
        external
        pure
        returns (uint32[] memory, bytes[] memory)
    {
        uint256 code = abi.decode(params, (uint256));
        revert MockActionReason(code);
    }
}
