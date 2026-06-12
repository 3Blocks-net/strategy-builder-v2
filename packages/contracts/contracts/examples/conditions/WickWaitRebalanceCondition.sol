// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../interfaces/IUpdatableCondition.sol";
import "../../interfaces/external/INonfungiblePositionManager.sol";
import "../../interfaces/external/IPancakeV3Factory.sol";
import "../../interfaces/external/IPancakeV3Pool.sol";
import "../../registries/PancakeSwapV3Registry.sol";
import "../../libraries/ActionLib.sol";

/**
 * @title WickWaitRebalanceCondition
 * @notice Rebalance trigger for the Wick-&-Wait concentrated-liquidity strategy.
 *
 * Fires only when the pool's **time-weighted-average tick** over a window `W` has
 * left the open position's range **AND** a cooldown has elapsed since the last
 * rebalance. Averaging over `W` (rather than reading the spot tick) makes the
 * trigger ignore short **wicks**: a brief spike that reverts within `W` barely
 * moves the mean tick, so the position is left to keep earning fees. A persistent
 * move drags the mean out of range and fires the rebalance.
 *
 * Called via `staticcall` (both `check` and `afterExecution` are `view`); holds no
 * state variables (the `registry` is `immutable`, so it is delegatecall/staticcall-safe).
 *
 * Position & pool
 * ───────────────
 * The position token-id is read from a context slot (written by the Mint action).
 * The pool is derived from the position's `token0`/`token1`/`fee` — a single source
 * of truth, so the range and the price always come from the same live position.
 *
 * Cooldown state
 * ──────────────
 * `lastRebalanceSlot` holds the unix timestamp of the last firing (0 = never).
 * `afterExecution` — called by the vault only when the trigger fired — writes
 * `block.timestamp` back, so the cooldown advances exactly once per rebalance.
 *
 * Params (ABI):
 *   uint32  tokenIdSlot        – context slot holding the position token-id (uint256)
 *   uint32  twapWindow         – W in seconds (> 0); the TWAP averaging window
 *   uint256 cooldown           – minimum seconds between rebalances
 *   uint32  lastRebalanceSlot  – context slot holding the last-rebalance timestamp
 */
contract WickWaitRebalanceCondition is IUpdatableCondition {
    PancakeSwapV3Registry public immutable registry;

    struct Params {
        uint32 tokenIdSlot;
        uint32 twapWindow;
        uint256 cooldown;
        uint32 lastRebalanceSlot;
    }

    error ZeroWindow();
    error PoolNotFound();
    error SlotOutOfBounds(uint32 slot);

    constructor(address registry_) {
        require(registry_ != address(0), "registry=0");
        registry = PancakeSwapV3Registry(registry_);
    }

    /// @inheritdoc ICondition
    function check(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view override returns (bool met) {
        Params memory p = abi.decode(params, (Params));
        if (p.twapWindow == 0) revert ZeroWindow();

        // 1. Position range + pool (single source of truth — both from the position).
        uint256 tokenId = ActionLib.readUint256Slot(ctx, p.tokenIdSlot);
        INonfungiblePositionManager npm = INonfungiblePositionManager(
            registry.positionManager()
        );
        (
            ,
            ,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            ,
            ,
            ,
            ,

        ) = npm.positions(tokenId);
        address pool = registry.factory().getPool(token0, token1, fee);
        if (pool == address(0)) revert PoolNotFound();

        // 2. TWAP tick over W. `observe` reverts when the pool's observation
        //    cardinality does not cover W — that surfaces a misconfigured strategy
        //    instead of a silent "in range" never-fire.
        int24 twapTick = _twapTick(pool, p.twapWindow);

        // 3. Breach: the mean price has left the position's range.
        bool breach = twapTick < tickLower || twapTick >= tickUpper;
        if (!breach) return false;

        // 4. Cooldown since the last rebalance (unset slot = 0 ⇒ never rebalanced ⇒ not blocked).
        uint256 last = _readTimestamp(ctx, p.lastRebalanceSlot);
        met = block.timestamp >= last + p.cooldown;
    }

    /// @inheritdoc IUpdatableCondition
    /// @dev Records the firing time so the cooldown starts. Called only when
    ///      check() returned true (the rebalance actually ran), so the write is safe.
    function afterExecution(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view override returns (uint32[] memory updatedSlots, bytes[] memory updatedValues) {
        Params memory p = abi.decode(params, (Params));
        if (p.lastRebalanceSlot >= uint32(ctx.length)) {
            revert SlotOutOfBounds(p.lastRebalanceSlot);
        }
        updatedSlots = new uint32[](1);
        updatedValues = new bytes[](1);
        updatedSlots[0] = p.lastRebalanceSlot;
        updatedValues[0] = abi.encode(block.timestamp);
    }

    /// Arithmetic-mean tick over the last `w` seconds via the cumulative-tick oracle.
    /// Rounds toward −infinity for negative means (matches Uniswap `OracleLibrary.consult`).
    function _twapTick(address pool, uint32 w) private view returns (int24) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = w;
        secondsAgos[1] = 0;
        (int56[] memory cum, ) = IPancakeV3Pool(pool).observe(secondsAgos);
        int56 delta = cum[1] - cum[0];
        int56 window = int56(uint56(w));
        int24 tick = int24(delta / window);
        if (delta < 0 && (delta % window != 0)) tick--;
        return tick;
    }

    /// Read a uint256 timestamp from a context slot; an uninitialised slot reads as 0.
    function _readTimestamp(
        bytes[] calldata ctx,
        uint32 slot
    ) private pure returns (uint256) {
        if (slot >= uint32(ctx.length)) revert SlotOutOfBounds(slot);
        bytes calldata raw = ctx[slot];
        if (raw.length < 32) return 0;
        return abi.decode(raw, (uint256));
    }
}
