// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IAction.sol";
import "../interfaces/external/IAaveV3Pool.sol";
import "../registries/AaveV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title AaveV3BorrowAction
 * @notice Borrows a token from Aave V3 against the vault's collateral. Called via
 *         delegatecall — the borrowed tokens and the debt belong to the vault.
 *
 * Interest-rate mode is **always `2` (variable)** — the deprecated stable-rate
 * path is disabled on every Aave V3 market, so hardcoding 2 means the action can
 * never revert on it.
 *
 * Amount modes (this slice — simple only)
 * ───────────────────────────────────────
 *   FIXED     — borrow the exact `amount`.
 *   FROM_SLOT — borrow the amount read from `amountFromSlot`.
 *
 * The oracle-bound `MAX_AVAILABLE` (`availableBorrowsBase` → token, minus a
 * haircut) and `TARGET_HF` paths require the HF/oracle engine and are a later
 * slice — they revert here.
 *
 * No approval is needed. The borrowed amount is written to the optional output
 * slot so a subsequent swap/transfer can consume it.
 *
 * Stateless: `registry` is `immutable` (bytecode, delegatecall-safe).
 */
contract AaveV3BorrowAction is IAction {
    /// Aave variable interest-rate mode.
    uint256 private constant VARIABLE_RATE = 2;

    AaveV3Registry public immutable registry;

    struct Params {
        address asset; // ERC-20 to borrow
        uint8 mode; // ActionLib.AmountMode (FIXED or FROM_SLOT only here)
        uint256 amount; // FIXED amount
        uint32 amountFromSlot; // FROM_SLOT source (else NO_SLOT)
        uint256 targetHealthFactor; // TARGET_HF target (later slice)
        uint32 amountToSlot; // optional: write the borrowed amount
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

        uint256 amount = _resolveAmount(p, ctx);

        registry.pool().borrow(p.asset, amount, VARIABLE_RATE, 0, address(this));

        (updatedSlots, updatedValues) = ActionLib.singleSlotDiff(
            p.amountToSlot,
            amount
        );
    }

    function _resolveAmount(
        Params memory p,
        bytes[] calldata ctx
    ) private pure returns (uint256) {
        ActionLib.AmountMode mode = ActionLib.AmountMode(p.mode);

        uint256 amount;
        if (mode == ActionLib.AmountMode.FIXED) {
            amount = p.amount;
        } else if (mode == ActionLib.AmountMode.FROM_SLOT) {
            amount = ActionLib.readUint256Slot(ctx, p.amountFromSlot);
        } else {
            // MAX_AVAILABLE / TARGET_HF need the HF/oracle engine (later slice).
            revert UnsupportedMode(p.mode);
        }

        if (amount == 0) revert ZeroAmount();
        return amount;
    }
}
