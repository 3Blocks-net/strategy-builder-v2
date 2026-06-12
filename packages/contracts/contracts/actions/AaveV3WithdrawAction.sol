// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/IAction.sol";
import "../interfaces/external/IAaveV3Pool.sol";
import "../interfaces/external/IAaveOracle.sol";
import "../registries/AaveV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title AaveV3WithdrawAction
 * @notice Withdraws a supplied token (collateral) from Aave V3 back into the
 *         vault. Called via delegatecall — the burned aTokens and the received
 *         underlying belong to the vault.
 *
 * Amount modes
 * ────────────
 *   FIXED         — withdraw the exact `amount`.
 *   FROM_SLOT     — withdraw the amount read from `amountFromSlot`.
 *   MAX_AVAILABLE — "withdraw everything": passes `type(uint256).max`, so Aave
 *                   withdraws the full aToken balance. (If an open loan would
 *                   breach the health factor, Aave reverts.)
 *   TARGET_HF     — withdraw collateral until the position's health factor drops
 *                   to `targetHealthFactor` (no-op when already at/below it).
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
        uint256 targetHealthFactor; // TARGET_HF target (WAD, 1e18)
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

        // Oracle-bound modes can resolve to 0 (no safe amount / wrong-direction
        // TARGET_HF) — that is a no-op, not a revert.
        uint256 actual;
        if (requested > 0) {
            actual = registry.pool().withdraw(p.asset, requested, address(this));
        }

        (updatedSlots, updatedValues) = ActionLib.singleSlotDiff(
            p.amountToSlot,
            actual
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
            return _maxWithdraw(p.asset);
        }
        return _targetHfWithdraw(p.asset, p.targetHealthFactor);
    }

    /// Max-safe withdraw keeping HF ≥ 1 (minus haircut). uint256.max ("all")
    /// only when there is no debt. Capped at the vault's aToken balance.
    function _maxWithdraw(address asset) private view returns (uint256) {
        IAaveV3Pool pool = registry.pool();
        (uint256 c, uint256 d, , uint256 lt, , ) = pool.getUserAccountData(address(this));
        if (d == 0) return type(uint256).max; // no debt → withdraw all (no oracle)

        uint256 safeBase = ActionLib.maxSafeWithdrawBase(
            ActionLib.normalizeBase(c),
            ActionLib.normalizeBase(d),
            lt
        );
        if (safeBase == 0) return 0;
        uint256 tokens = ActionLib.baseToToken(safeBase, _price(asset), IERC20Metadata(asset).decimals());
        return _capByAToken(pool, asset, tokens);
    }

    /// Withdraw collateral to LOWER the health factor to `targetHF`. No-op when
    /// there is no debt or the current HF is already ≤ target (wrong direction).
    function _targetHfWithdraw(
        address asset,
        uint256 targetHF
    ) private view returns (uint256) {
        ActionLib.requireValidTargetHF(targetHF);
        IAaveV3Pool pool = registry.pool();
        (uint256 c, uint256 d, , uint256 lt, , ) = pool.getUserAccountData(address(this));
        if (d == 0) return 0; // no debt ⇒ HF is infinite, cannot reach target

        uint256 collateral18 = ActionLib.normalizeBase(c);
        uint256 targetColl = ActionLib.targetCollateralBase(
            ActionLib.normalizeBase(d),
            lt,
            targetHF
        );
        if (targetColl >= collateral18) return 0; // already ≤ target
        uint256 removeBase = collateral18 - targetColl;
        uint256 tokens = ActionLib.baseToToken(removeBase, _price(asset), IERC20Metadata(asset).decimals());
        return _capByAToken(pool, asset, tokens);
    }

    function _price(address asset) private view returns (uint256) {
        return ActionLib.normalizeBase(IAaveOracle(registry.priceOracle()).getAssetPrice(asset));
    }

    function _capByAToken(
        IAaveV3Pool pool,
        address asset,
        uint256 tokens
    ) private view returns (uint256) {
        address aToken = pool.getReserveData(asset).aTokenAddress;
        uint256 bal = aToken == address(0) ? 0 : IERC20(aToken).balanceOf(address(this));
        return tokens < bal ? tokens : bal;
    }
}
