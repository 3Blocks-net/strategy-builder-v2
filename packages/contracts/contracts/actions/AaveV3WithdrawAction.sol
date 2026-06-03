// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IAction.sol";
import "../interfaces/external/IAaveV3Pool.sol";
import "../registries/AaveV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title AaveV3WithdrawAction
 * @notice Withdraws a supplied token (collateral) from Aave V3 back into the
 *         vault. Called via delegatecall — the burned aTokens and the received
 *         underlying belong to the vault.
 *
 * Amount modes (this slice — simple only)
 * ───────────────────────────────────────
 *   FIXED         — withdraw the exact `amount`.
 *   FROM_SLOT     — withdraw the amount read from `amountFromSlot`.
 *   MAX_AVAILABLE — "withdraw everything": passes `type(uint256).max`, so Aave
 *                   withdraws the full aToken balance. (The debt-aware
 *                   max-safe-withdraw and TARGET_HF paths are a later slice; if
 *                   an open loan would breach the health factor, Aave reverts.)
 *
 * No approval is needed — `Pool.withdraw` burns the caller's (vault's) aTokens.
 * The **actual** withdrawn amount returned by the Pool (which differs from the
 * `uint256.max` sentinel, and from a requested amount when capped) is written to
 * the optional output slot for downstream steps.
 *
 * Stateless: `registry` is `immutable` (bytecode, delegatecall-safe).
 */
contract AaveV3WithdrawAction is IAction {
    AaveV3Registry public immutable registry;

    struct Params {
        address asset; // ERC-20 to withdraw
        uint8 mode; // ActionLib.AmountMode
        uint256 amount; // FIXED amount
        uint32 amountFromSlot; // FROM_SLOT source (else NO_SLOT)
        uint256 targetHealthFactor; // TARGET_HF target (later slice)
        uint32 amountToSlot; // optional: write the ACTUAL withdrawn amount
    }

    error ZeroAsset();
    error ZeroAmount();
    error UnsupportedMode(uint8 mode);

    constructor(address registry_) {
        require(registry_ != address(0), "registry=0");
        registry = AaveV3Registry(registry_);
    }

    function execute(
        bytes calldata params,
        bytes[] calldata ctx
    )
        external
        override
        returns (uint32[] memory updatedSlots, bytes[] memory updatedValues)
    {
        Params memory p = abi.decode(params, (Params));
        if (p.asset == address(0)) revert ZeroAsset();

        uint256 requested = _resolveAmount(p, ctx);

        uint256 actual = registry.pool().withdraw(p.asset, requested, address(this));

        (updatedSlots, updatedValues) = ActionLib.singleSlotDiff(
            p.amountToSlot,
            actual
        );
    }

    function _resolveAmount(
        Params memory p,
        bytes[] calldata ctx
    ) private pure returns (uint256) {
        ActionLib.AmountMode mode = ActionLib.AmountMode(p.mode);

        if (mode == ActionLib.AmountMode.MAX_AVAILABLE) {
            // "Withdraw everything" — Aave treats uint256.max as the full balance.
            return type(uint256).max;
        }

        uint256 amount;
        if (mode == ActionLib.AmountMode.FIXED) {
            amount = p.amount;
        } else if (mode == ActionLib.AmountMode.FROM_SLOT) {
            amount = ActionLib.readUint256Slot(ctx, p.amountFromSlot);
        } else {
            // TARGET_HF (and any future mode) is not supported in this slice.
            revert UnsupportedMode(p.mode);
        }

        if (amount == 0) revert ZeroAmount();
        return amount;
    }
}
