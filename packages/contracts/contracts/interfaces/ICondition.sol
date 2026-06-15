// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title ICondition
 * @notice Interface that all Condition contracts must implement.
 *         Called via staticcall from the vault — must be view/pure.
 *
 * params  ABI-encoded static parameters set at automation creation time.
 * ctx     The automation's persistent context slots (read-only here).
 *         Conditions may inspect context values but must not modify them.
 */
interface ICondition {
    function check(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view returns (bool met);
}
