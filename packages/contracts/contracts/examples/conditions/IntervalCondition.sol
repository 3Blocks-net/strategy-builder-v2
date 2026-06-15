// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../interfaces/IUpdatableCondition.sol";

/**
 * @title IntervalCondition
 * @notice Fires when block.timestamp has reached the next scheduled execution time,
 *         then automatically advances the schedule by `interval` seconds.
 *
 * The next-trigger timestamp is stored in a vault context slot chosen by the owner.
 * After each successful execution the vault calls afterExecution, which increments
 * the stored timestamp by `interval` — no extra action step required.
 *
 * Setup
 * ──────
 * 1. Choose a free context slot (e.g. 0).
 * 2. Ensure the vault context has at least slot+1 entries:
 *      vault.setContext([abi.encode(startTimestamp)])
 *    or, if context is already the right length:
 *      vault.setContextSlot(slot, abi.encode(startTimestamp))
 * 3. Add IntervalCondition as step 0 of the automation:
 *      Step({ stepType: CONDITION, target: intervalConditionAddr,
 *             selector: ICondition.check.selector,
 *             nextOnTrue: 1, nextOnFalse: DONE,
 *             data: abi.encode(interval, timeSlot) })
 *
 * Behaviour
 * ──────────
 * • check returns false when ctx[timeSlot] is empty or zero (not yet initialised).
 * • check returns true  when block.timestamp >= storedNextTime.
 * • afterExecution advances storedNextTime by `interval` so the next fire is at
 *   previousNextTime + interval (drift-free relative to the schedule, not to now).
 *
 * Params encoding (ABI):
 *   uint256 interval  – seconds between executions (must be > 0).
 *   uint32  timeSlot  – vault context slot that holds the next trigger time (uint256).
 */
contract IntervalCondition is IUpdatableCondition {
    struct Params {
        uint256 interval;
        uint32 timeSlot;
    }

    error SlotOutOfBounds(uint32 slot);
    error ZeroInterval();

    /// @inheritdoc ICondition
    function check(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view override returns (bool met) {
        Params memory p = abi.decode(params, (Params));

        if (p.timeSlot >= uint32(ctx.length))
            revert SlotOutOfBounds(p.timeSlot);

        bytes memory raw = ctx[p.timeSlot];
        if (raw.length < 32) return false; // not yet initialised

        uint256 nextTime = abi.decode(raw, (uint256));
        if (nextTime == 0) return false; // explicitly unset

        met = block.timestamp >= nextTime;
    }

    /// @inheritdoc IUpdatableCondition
    function afterExecution(
        bytes calldata params,
        bytes[] calldata ctx
    )
        external
        pure
        override
        returns (uint32[] memory updatedSlots, bytes[] memory updatedValues)
    {
        Params memory p = abi.decode(params, (Params));

        if (p.interval == 0) revert ZeroInterval();
        if (p.timeSlot >= uint32(ctx.length))
            revert SlotOutOfBounds(p.timeSlot);

        uint256 nextTime = ctx[p.timeSlot].length >= 32
            ? abi.decode(ctx[p.timeSlot], (uint256))
            : 0;

        updatedSlots = new uint32[](1);
        updatedValues = new bytes[](1);
        updatedSlots[0] = p.timeSlot;
        // Advance by interval — drift-free: always relative to the last schedule,
        // not to block.timestamp, so missed beats don't shift the entire schedule.
        updatedValues[0] = abi.encode(nextTime + p.interval);
    }
}
