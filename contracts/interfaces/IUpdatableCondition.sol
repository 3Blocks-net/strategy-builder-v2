// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ICondition.sol";

/**
 * @title IUpdatableCondition
 * @notice Optional extension of ICondition for conditions that need to update vault
 *         context after a successful automation execution.
 *
 * The vault calls afterExecution on step 0 (via staticcall) at the end of
 * executeAutomation, but only when the trigger (step 0) actually fired (returned true).
 * The returned slot diff is applied to the context before it is saved to storage.
 *
 * Because the call is staticcall, afterExecution must be view — it computes the
 * new context values from its inputs and block state without writing anything.
 * Only the vault writes the resulting diff to storage.
 */
interface IUpdatableCondition is ICondition {
    /**
     * @notice Called by the vault after a successful automation execution.
     *         Computes updated context slot values (e.g. advance a schedule).
     *
     * @param params  ABI-encoded static parameters — the same bytes stored in Step.data.
     * @param ctx     The vault context at the end of execution (after actions ran).
     * @return updatedSlots   Indices of context slots to update.
     * @return updatedValues  New ABI-encoded values for those slots.
     */
    function afterExecution(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues
    );
}
