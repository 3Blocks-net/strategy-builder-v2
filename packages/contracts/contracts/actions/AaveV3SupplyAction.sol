// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IAction.sol";
import "../interfaces/external/IAaveV3Pool.sol";
import "../registries/AaveV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title AaveV3SupplyAction
 * @notice Supplies an ERC-20 from the vault to Aave V3 as collateral. Called via
 *         delegatecall — runs in the vault's storage/balance context, so the
 *         supplied aTokens belong to the vault.
 *
 * Amount modes (this slice)
 * ─────────────────────────
 *   FIXED         — supply the exact `amount`.
 *   FROM_SLOT     — supply the amount read from `amountFromSlot`.
 *   MAX_AVAILABLE — supply the full vault balance of `asset`.
 *   TARGET_HF     — reserved; reverts until the HF/oracle slice ships it.
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
        uint256 targetHealthFactor; // TARGET_HF target (later slice)
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
        if (amount == 0) revert ZeroAmount();

        IAaveV3Pool pool = registry.pool();

        IERC20(p.asset).forceApprove(address(pool), amount);
        pool.supply(p.asset, amount, address(this), 0);
        // Reset allowance — supply pulls exactly `amount`, but stay defensive.
        IERC20(p.asset).forceApprove(address(pool), 0);

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
            return p.amount;
        }
        if (mode == ActionLib.AmountMode.FROM_SLOT) {
            return ActionLib.readUint256Slot(ctx, p.amountFromSlot);
        }
        if (mode == ActionLib.AmountMode.MAX_AVAILABLE) {
            // Supply MAX_AVAILABLE = full vault balance of the asset.
            return ActionLib.fullBalance(p.asset);
        }
        // TARGET_HF (and any future mode) is not supported in this slice.
        revert UnsupportedMode(p.mode);
    }
}
