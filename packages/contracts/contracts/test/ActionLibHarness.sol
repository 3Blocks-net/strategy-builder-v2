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

    // ── Aave HF/oracle engine (hard-fixture surface) ──────────────────────

    function MIN_TARGET_HF() external pure returns (uint256) {
        return ActionLib.MIN_TARGET_HF;
    }

    function HAIRCUT_BPS() external pure returns (uint256) {
        return ActionLib.HAIRCUT_BPS;
    }

    function normalizeBase(uint256 v8) external pure returns (uint256) {
        return ActionLib.normalizeBase(v8);
    }

    function baseToToken(
        uint256 base18,
        uint256 price,
        uint8 dec
    ) external pure returns (uint256) {
        return ActionLib.baseToToken(base18, price, dec);
    }

    function tokenToBase(
        uint256 amount,
        uint256 price,
        uint8 dec
    ) external pure returns (uint256) {
        return ActionLib.tokenToBase(amount, price, dec);
    }

    function applyHaircut(uint256 base18) external pure returns (uint256) {
        return ActionLib.applyHaircut(base18);
    }

    function targetDebtBase(
        uint256 collateral18,
        uint256 ltBps,
        uint256 targetHF
    ) external pure returns (uint256) {
        return ActionLib.targetDebtBase(collateral18, ltBps, targetHF);
    }

    function targetCollateralBase(
        uint256 debt18,
        uint256 ltBps,
        uint256 targetHF
    ) external pure returns (uint256) {
        return ActionLib.targetCollateralBase(debt18, ltBps, targetHF);
    }

    function maxSafeWithdrawBase(
        uint256 collateral18,
        uint256 debt18,
        uint256 ltBps
    ) external pure returns (uint256) {
        return ActionLib.maxSafeWithdrawBase(collateral18, debt18, ltBps);
    }

    function requireValidTargetHF(uint256 targetHF) external pure {
        ActionLib.requireValidTargetHF(targetHF);
    }
}
