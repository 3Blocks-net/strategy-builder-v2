// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/IAction.sol";
import "../interfaces/external/IAaveV3Pool.sol";
import "../interfaces/external/IAaveOracle.sol";
import "../registries/AaveV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title AaveV3SupplyAction
 * @notice Supplies an ERC-20 from the vault to Aave V3 as collateral. Called via
 *         delegatecall — runs in the vault's storage/balance context, so the
 *         supplied aTokens belong to the vault.
 *
 * Amount modes
 * ────────────
 *   FIXED         — supply the exact `amount`.
 *   FROM_SLOT     — supply the amount read from `amountFromSlot`.
 *   MAX_AVAILABLE — supply the full vault balance of `asset`.
 *   TARGET_HF     — supply collateral until the position's health factor rises to
 *                   `targetHealthFactor` (no-op when already at/above it).
 *
 * Approval hygiene
 * ────────────────
 * `forceApprove(pool, amount)` before the supply, then `forceApprove(pool, 0)`
 * after — no standing allowance to the Aave Pool is left behind.
 *
 * IMPORTANT: No state variables — `registry` is `immutable` (lives in bytecode,
 *            read correctly under delegatecall), so the action stays stateless.
 */
contract AaveV3SupplyAction is IAction {
    using SafeERC20 for IERC20;

    /// Aave registry holding the cached Pool. Immutable → delegatecall-safe.
    AaveV3Registry public immutable registry;

    struct Params {
        address asset; // ERC-20 to supply
        uint8 mode; // ActionLib.AmountMode
        uint256 amount; // FIXED amount
        uint32 amountFromSlot; // FROM_SLOT source (else NO_SLOT)
        uint256 targetHealthFactor; // TARGET_HF target (WAD, 1e18)
        uint32 amountToSlot; // optional: write supplied amount (else NO_SLOT)
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

        // TARGET_HF wrong-direction / best-effort → amount 0 ⇒ no-op (the step
        // proceeds). FIXED / FROM_SLOT zero already reverted in _resolveAmount.
        if (amount > 0) {
            IAaveV3Pool pool = registry.pool();
            IERC20(p.asset).forceApprove(address(pool), amount);
            pool.supply(p.asset, amount, address(this), 0);
            // Reset allowance — supply pulls exactly `amount`, but stay defensive.
            IERC20(p.asset).forceApprove(address(pool), 0);
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
            // Supply MAX_AVAILABLE = full vault balance of the asset (no oracle).
            return ActionLib.fullBalance(p.asset);
        }
        // TARGET_HF — supply collateral to RAISE the health factor to target.
        return _targetHfAmount(p.asset, p.targetHealthFactor);
    }

    /// Collateral to add (capped at the vault balance) to reach `targetHF`.
    /// Wrong direction (current HF ≥ target) ⇒ 0 (no-op).
    function _targetHfAmount(
        address asset,
        uint256 targetHF
    ) private view returns (uint256) {
        ActionLib.requireValidTargetHF(targetHF);
        (uint256 c, uint256 d, , uint256 lt, , ) = registry.pool().getUserAccountData(address(this));
        // No debt ⇒ HF is infinite, already ≥ any target ⇒ no-op.
        if (d == 0) return 0;

        uint256 collateral18 = ActionLib.normalizeBase(c);
        uint256 targetCollateral = ActionLib.targetCollateralBase(
            ActionLib.normalizeBase(d),
            lt,
            targetHF
        );
        if (targetCollateral <= collateral18) return 0; // already ≥ target
        uint256 addBase = targetCollateral - collateral18;
        uint256 price = ActionLib.normalizeBase(
            IAaveOracle(registry.priceOracle()).getAssetPrice(asset)
        );
        uint256 tokens = ActionLib.baseToToken(
            addBase,
            price,
            IERC20Metadata(asset).decimals()
        );
        uint256 balance = ActionLib.fullBalance(asset);
        return tokens < balance ? tokens : balance; // best-effort cap
    }
}
