// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../libraries/ActionLib.sol";

/**
 * @title ActionLibHarness
 * @notice Thin external wrapper around ActionLib's internal functions so they
 *         can be exercised by isolated Solidity-level unit tests. Tests only.
 */
contract ActionLibHarness {
    function NO_SLOT() external pure returns (uint32) {
        return ActionLib.NO_SLOT;
    }

    function readUint256Slot(
        bytes[] calldata ctx,
        uint32 slot
    ) external pure returns (uint256) {
        return ActionLib.readUint256Slot(ctx, slot);
    }

    function fullBalance(address token) external view returns (uint256) {
        return ActionLib.fullBalance(token);
    }

    function singleSlotDiff(
        uint32 slot,
        uint256 value
    ) external pure returns (uint32[] memory slots, bytes[] memory values) {
        return ActionLib.singleSlotDiff(slot, value);
    }
}
