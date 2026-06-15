// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/external/IAaveV3Pool.sol";
import "../interfaces/external/IAaveOracle.sol";

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
 * Withdraw/Borrow/Repay and the TARGET_HF inverse math) lives here too
 * (`targetDebtBase` / `requireValidTargetHF` and the per-action resolvers).
 * Resolving a mode is the action's responsibility; any mode an action does not
 * implement must revert there.
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
        TARGET_HF // 3 — compute amount to reach a target health factor (HF/oracle math)
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

    // ─────────────────────────────────────────────────────────────────────
    //  Aave health-factor / oracle engine (slice #5)
    //
    //  All base/HF math is done in WAD (1e18). Aave's base currency and
    //  getAssetPrice are 8-decimals on BSC, so they are normalized ×1e10 at the
    //  read boundary (`normalizeBase`). Liquidation threshold / LTV are bps
    //  (1e4). The health factor returned by getUserAccountData is already WAD.
    //
    //  HF = (collateral × liquidationThreshold / 1e4) × 1e18 / debt
    //  → the four inverse-HF targets below solve that for the binding side.
    // ─────────────────────────────────────────────────────────────────────

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 1e4;
    /// 8-decimal Aave base → 18-decimal WAD.
    uint256 internal constant BASE_TO_WAD = 1e10;
    /// Minimum acceptable target health factor (1.05). Below this we reject.
    uint256 internal constant MIN_TARGET_HF = 1.05e18;
    /// Conservative safety haircut applied to Borrow-MAX / Withdraw-MAX (0.5%).
    uint256 internal constant HAIRCUT_BPS = 50;

    /// Snapshot of the inputs the oracle-bound modes need.
    struct AaveCtx {
        uint256 collateralBase; // WAD
        uint256 debtBase; // WAD
        uint256 availableBorrowsBase; // WAD
        uint256 liquidationThresholdBps; // bps
        uint256 price; // WAD (USD per whole token)
        uint8 assetDecimals;
    }

    error InvalidTargetHealthFactor(uint256 target);

    /// Normalize an 8-decimal Aave base/price value to 18-decimal WAD.
    function normalizeBase(uint256 v8) internal pure returns (uint256) {
        return v8 * BASE_TO_WAD;
    }

    /// base value (WAD) → token base units, floored. `price` is WAD USD/token.
    function baseToToken(
        uint256 base18,
        uint256 price,
        uint8 assetDecimals
    ) internal pure returns (uint256) {
        if (price == 0) return 0;
        return (base18 * (10 ** uint256(assetDecimals))) / price;
    }

    /// token base units → base value (WAD).
    function tokenToBase(
        uint256 amount,
        uint256 price,
        uint8 assetDecimals
    ) internal pure returns (uint256) {
        return (amount * price) / (10 ** uint256(assetDecimals));
    }

    /// Apply the conservative safety haircut (HAIRCUT_BPS) to a base value.
    function applyHaircut(uint256 base18) internal pure returns (uint256) {
        return (base18 * (BPS - HAIRCUT_BPS)) / BPS;
    }

    /**
     * Target TOTAL debt (WAD) that yields `targetHF` given `collateral` (WAD)
     * and `ltBps`: D' = C × LT × WAD / (BPS × targetHF).
     */
    function targetDebtBase(
        uint256 collateral18,
        uint256 ltBps,
        uint256 targetHF
    ) internal pure returns (uint256) {
        if (targetHF == 0) return 0;
        return (collateral18 * ltBps * WAD) / (BPS * targetHF);
    }

    /**
     * Target TOTAL collateral (WAD) that yields `targetHF` given `debt` (WAD)
     * and `ltBps`: C' = targetHF × D × BPS / (LT × WAD).
     */
    function targetCollateralBase(
        uint256 debt18,
        uint256 ltBps,
        uint256 targetHF
    ) internal pure returns (uint256) {
        if (ltBps == 0) return 0;
        return (targetHF * debt18 * BPS) / (ltBps * WAD);
    }

    /**
     * Max collateral (WAD) that can be withdrawn while keeping HF ≥ 1, with the
     * safety haircut. Returns `type(uint256).max` when there is no debt (the
     * whole position is free), and 0 when nothing can be safely withdrawn.
     */
    function maxSafeWithdrawBase(
        uint256 collateral18,
        uint256 debt18,
        uint256 ltBps
    ) internal pure returns (uint256) {
        if (debt18 == 0) return type(uint256).max;
        if (ltBps == 0) return 0;
        uint256 collateralFloor = (debt18 * BPS) / ltBps; // HF = 1 boundary
        if (collateral18 <= collateralFloor) return 0;
        return applyHaircut(collateral18 - collateralFloor);
    }

    /// Revert if a TARGET_HF target is at/below the safety floor (1.05).
    function requireValidTargetHF(uint256 targetHF) internal pure {
        if (targetHF <= MIN_TARGET_HF) revert InvalidTargetHealthFactor(targetHF);
    }

    /// Load the live Aave inputs (oracle resolved at call time by the caller).
    function loadAaveCtx(
        IAaveV3Pool pool,
        address oracle,
        address asset,
        address account
    ) internal view returns (AaveCtx memory ctx) {
        (
            uint256 collateral,
            uint256 debt,
            uint256 availableBorrows,
            uint256 liquidationThreshold,
            ,

        ) = pool.getUserAccountData(account);
        ctx.collateralBase = normalizeBase(collateral);
        ctx.debtBase = normalizeBase(debt);
        ctx.availableBorrowsBase = normalizeBase(availableBorrows);
        ctx.liquidationThresholdBps = liquidationThreshold;
        ctx.price = normalizeBase(IAaveOracle(oracle).getAssetPrice(asset));
        ctx.assetDecimals = IERC20Metadata(asset).decimals();
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
