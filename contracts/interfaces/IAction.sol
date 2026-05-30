// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IAction
 * @notice Signature that every action function on an action contract must follow.
 *         Called via delegatecall from the vault — executes in the vault's
 *         storage and balance context (msg.sender / address(this) == vault).
 *
 * Multi-function action contracts
 * ────────────────────────────────
 * A single contract may expose many action functions. Each function must match
 * this return signature. The Step.selector field in the vault tells the vault
 * which function to call.
 *
 * Context diff return
 * ────────────────────
 * Actions return only the slots they changed as a parallel pair of arrays:
 *   updatedSlots  – indices of the modified context slots
 *   updatedValues – new ABI-encoded values for those slots
 * Return both arrays empty to signal "no context change".
 *
 * IMPORTANT: Action implementations MUST NOT declare state variables.
 *            Any storage access operates on the vault's storage layout.
 */
interface IAction {
    function execute(
        bytes calldata params,
        bytes[] calldata ctx
    ) external returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues
    );
}
