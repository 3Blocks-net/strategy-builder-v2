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
 * Volume / fee
 * ─────────────
 * volumeToken  – ERC-20 token address whose amount was moved/generated.
 *                Return address(0) if this action is not fee-bearing.
 * volumeAmount – Raw token amount (in token's native decimals) that represents
 *                the economic volume of this action.
 *                Return 0 if the action is not fee-bearing.
 *
 * The vault converts (volumeToken, volumeAmount) → USD using an external
 * IPriceOracle and multiplies by the fee basis points from FeeRegistry to
 * compute the per-step fee (emitted as FeeAccrued).  No token transfer happens
 * inside the action for fee purposes.
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
        bytes[] memory updatedValues,
        address volumeToken,
        uint256 volumeAmount
    );
}
