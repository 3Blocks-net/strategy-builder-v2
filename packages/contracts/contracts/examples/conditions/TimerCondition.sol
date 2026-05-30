// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../interfaces/IUpdatableCondition.sol";

/**
 * @title TimerCondition
 * @notice One-shot trigger that fires once after a configurable delay from an
 *         externally set start time.  After firing the timer resets to stopped
 *         (slot → 0) via afterExecution, so it will not fire again until
 *         explicitly restarted.
 *
 * Contrast with IntervalCondition (recurring) — TimerCondition fires exactly
 * once per manual start.
 *
 * Starting the timer
 * ───────────────────
 * Write the desired start timestamp into the context slot:
 *   vault.setContextSlot(slot, abi.encode(block.timestamp))
 *
 * The slot value is interpreted as the start time.  The condition fires when
 *   block.timestamp >= startTime + delta
 * Slot value 0 (or empty bytes) means the timer is stopped.
 *
 * Lifecycle
 * ──────────
 *   Stopped (slot == 0)  ──[owner sets slot]──▶  Running (slot == startTime)
 *       ▲                                              │
 *       │                                  block.timestamp >= startTime + delta
 *       │                                              │
 *       └──[afterExecution resets slot to 0]──◀  check() == true
 *
 * Params encoding (ABI):
 *   uint256 delta     – seconds after startTime before the timer fires (must be > 0).
 *   uint32  timeSlot  – vault context slot holding the start timestamp (uint256).
 */
contract TimerCondition is IUpdatableCondition {
    struct Params {
        uint256 delta;
        uint32  timeSlot;
    }

    error SlotOutOfBounds(uint32 slot);
    error ZeroDelta();

    /// @inheritdoc ICondition
    function check(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view override returns (bool met) {
        Params memory p = abi.decode(params, (Params));

        if (p.timeSlot >= uint32(ctx.length)) revert SlotOutOfBounds(p.timeSlot);

        bytes memory raw = ctx[p.timeSlot];
        if (raw.length < 32) return false; // slot not initialised

        uint256 startTime = abi.decode(raw, (uint256));
        if (startTime == 0) return false;  // timer not started

        met = block.timestamp >= startTime + p.delta;
    }

    /// @inheritdoc IUpdatableCondition
    /// @dev Resets the time slot to 0 so the timer does not fire again until
    ///      explicitly restarted.  Called only when check() returned true
    ///      (triggerFired), so the reset is safe.
    function afterExecution(
        bytes calldata params,
        bytes[] calldata ctx
    ) external pure override returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues
    ) {
        Params memory p = abi.decode(params, (Params));

        if (p.delta == 0) revert ZeroDelta();
        if (p.timeSlot >= uint32(ctx.length)) revert SlotOutOfBounds(p.timeSlot);

        updatedSlots    = new uint32[](1);
        updatedValues   = new bytes[](1);
        updatedSlots[0] = p.timeSlot;
        updatedValues[0] = abi.encode(uint256(0)); // stop the timer
    }
}
