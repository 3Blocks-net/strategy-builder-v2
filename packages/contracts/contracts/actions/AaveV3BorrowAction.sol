// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/IAction.sol";
import "../interfaces/external/IAaveV3Pool.sol";
import "../interfaces/external/IAaveOracle.sol";
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
 * Amount modes
 * ────────────
 *   FIXED         — borrow the exact `amount`.
 *   FROM_SLOT     — borrow the amount read from `amountFromSlot`.
 *   MAX_AVAILABLE — oracle-bound max (`availableBorrowsBase` → token, minus a haircut).
 *   TARGET_HF     — borrow until the position's health factor drops to
 *                   `targetHealthFactor` (no-op when already at/below it).
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
        uint8 mode; // ActionLib.AmountMode (FIXED / FROM_SLOT / MAX_AVAILABLE / TARGET_HF)
        uint256 amount; // FIXED amount
        uint32 amountFromSlot; // FROM_SLOT source (else NO_SLOT)
        uint256 targetHealthFactor; // TARGET_HF target (WAD, 1e18)
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

        // Oracle-bound modes can resolve to 0 (no borrowing power / wrong-
        // direction TARGET_HF) — that is a no-op, not a revert.
        if (amount > 0) {
            registry.pool().borrow(p.asset, amount, VARIABLE_RATE, 0, address(this));
        }

        (updatedSlots, updatedValues) = ActionLib.singleSlotDiff(
            p.amountToSlot,
            amount
        );
    }

    function _resolveAmount(
        Params memory p,
        bytes[] calldata ctx
    ) private view returns (uint256) {
        ActionLib.AmountMode mode = ActionLib.AmountMode(p.mode);

        if (mode == ActionLib.AmountMode.FIXED) {
            if (p.amount == 0) revert ZeroAmount();
            return p.amount;
        }
        if (mode == ActionLib.AmountMode.FROM_SLOT) {
            uint256 a = ActionLib.readUint256Slot(ctx, p.amountFromSlot);
            if (a == 0) revert ZeroAmount();
            return a;
        }
        if (mode == ActionLib.AmountMode.MAX_AVAILABLE) {
            return _maxBorrow(p.asset);
        }
        return _targetHfBorrow(p.asset, p.targetHealthFactor);
    }

    /// MAX_AVAILABLE = availableBorrowsBase → token, minus the safety haircut.
    function _maxBorrow(address asset) private view returns (uint256) {
        (, , uint256 avail, , , ) = registry.pool().getUserAccountData(address(this));
        if (avail == 0) return 0; // no borrowing power → no-op (no oracle read)
        uint256 base = ActionLib.applyHaircut(ActionLib.normalizeBase(avail));
        return ActionLib.baseToToken(base, _price(asset), IERC20Metadata(asset).decimals());
    }

    /// Borrow to LOWER the health factor to `targetHF`. No-op when the current
    /// HF is already ≤ target (wrong direction) or there is no collateral.
    function _targetHfBorrow(
        address asset,
        uint256 targetHF
    ) private view returns (uint256) {
        ActionLib.requireValidTargetHF(targetHF);
        (uint256 c, uint256 d, , uint256 lt, , ) = registry.pool().getUserAccountData(address(this));

        uint256 targetDebt = ActionLib.targetDebtBase(
            ActionLib.normalizeBase(c),
            lt,
            targetHF
        );
        uint256 curDebt = ActionLib.normalizeBase(d);
        if (targetDebt <= curDebt) return 0; // already ≤ target HF
        uint256 addBase = targetDebt - curDebt;
        return ActionLib.baseToToken(addBase, _price(asset), IERC20Metadata(asset).decimals());
    }

    function _price(address asset) private view returns (uint256) {
        return ActionLib.normalizeBase(IAaveOracle(registry.priceOracle()).getAssetPrice(asset));
    }
}
