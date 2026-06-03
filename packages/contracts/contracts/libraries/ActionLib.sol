// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ActionLib
 * @notice Shared computation/IO module for the DeFi action contracts. A pure
 *         Solidity `library` of `internal` functions — inlined into each action's
 *         bytecode, so it is delegatecall-safe and adds no storage.
 *
 * Version 1 (this slice) carries amount resolution across the three ERC-20
 * conventions, kept **strictly separate so they cannot leak between actions**:
 *   - `fullBalance`     — the `0 = full vault balance` convention (Supply MAX).
 *   - explicit/static   — the caller passes the amount through unchanged.
 *   - `readUint256Slot` — read an amount from a previous step's context slot.
 *
 * plus `singleSlotDiff` for building the `(updatedSlots, updatedValues)` return.
 *
 * The Aave health-factor / oracle math (MAX_AVAILABLE per-action semantics for
 * Withdraw/Borrow/Repay and the TARGET_HF inverse math) is intentionally NOT in
 * v1 — it arrives in the HF/oracle slice. `AmountMode.TARGET_HF` is reserved in
 * the enum so the on-chain encoding is stable, but resolving it is the action's
 * responsibility and unsupported modes must revert there.
 */
library ActionLib {
    /// Sentinel for "no context slot" (read or write skipped).
    uint32 internal constant NO_SLOT = type(uint32).max;

    /**
     * Amount selection mode shared by every Aave action. The integer values are
     * part of the on-chain ABI encoding and MUST stay stable.
     */
    enum AmountMode {
        FIXED, // 0 — use the explicit static amount
        FROM_SLOT, // 1 — read the amount from a context slot
        MAX_AVAILABLE, // 2 — per-action protocol maximum (Supply = full balance)
        TARGET_HF // 3 — compute amount to reach a target health factor (later slice)
    }

    error SlotOutOfBounds(uint32 slot);

    /**
     * Read a `uint256` from a context slot, reverting if the slot index is out
     * of range for the current context array.
     */
    function readUint256Slot(
        bytes[] calldata ctx,
        uint32 slot
    ) internal pure returns (uint256) {
        if (slot >= uint32(ctx.length)) revert SlotOutOfBounds(slot);
        return abi.decode(ctx[slot], (uint256));
    }

    /**
     * The full ERC-20 balance held by the vault. Under delegatecall
     * `address(this)` is the vault, so this is the vault's own balance.
     */
    function fullBalance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * Build a one-entry context diff for an action's optional output slot.
     * Returns empty arrays (no context change) when `slot == NO_SLOT`.
     */
    function singleSlotDiff(
        uint32 slot,
        uint256 value
    )
        internal
        pure
        returns (uint32[] memory slots, bytes[] memory values)
    {
        if (slot == NO_SLOT) {
            return (new uint32[](0), new bytes[](0));
        }
        slots = new uint32[](1);
        values = new bytes[](1);
        slots[0] = slot;
        values[0] = abi.encode(value);
    }
}
