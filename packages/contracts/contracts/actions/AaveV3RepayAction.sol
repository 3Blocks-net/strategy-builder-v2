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
 * @title AaveV3RepayAction
 * @notice Repays an Aave V3 loan from the vault. Called via delegatecall — the
 *         repaid debt belongs to the vault. Interest-rate mode is always `2`
 *         (variable) — the deprecated stable path is disabled on Aave V3.
 *
 * Amount modes
 * ────────────
 *   FIXED         — repay the exact `amount` (Aave caps at the outstanding debt).
 *   FROM_SLOT     — repay the amount read from `amountFromSlot`.
 *   MAX_AVAILABLE — "repay full debt", revert-free: caps at `min(debt, balance)`.
 *                   Passes `uint256.max` (Aave repays the whole debt) when the
 *                   balance covers it, otherwise repays the full balance. If
 *                   there is no debt or no balance it is a no-op.
 *   TARGET_HF     — repay debt until the position's health factor rises to
 *                   `targetHealthFactor` (no-op when already at/above it).
 *
 * Approval hygiene: `forceApprove` the amount the Pool may pull, then
 * `forceApprove(pool, 0)` after (Repay-MAX over-approves vs. what is consumed).
 *
 * The **actual** repaid amount returned by the Pool (≠ the `uint256.max`
 * sentinel) is written to the optional output slot.
 *
 * Stateless: `registry` is `immutable` (bytecode, delegatecall-safe).
 */
contract AaveV3RepayAction is IAction {
    using SafeERC20 for IERC20;

    uint256 private constant VARIABLE_RATE = 2;

    AaveV3Registry public immutable registry;

    struct Params {
        address asset; // borrowed ERC-20 to repay
        uint8 mode; // ActionLib.AmountMode
        uint256 amount; // FIXED amount
        uint32 amountFromSlot; // FROM_SLOT source (else NO_SLOT)
        uint256 targetHealthFactor; // TARGET_HF target (WAD, 1e18)
        uint32 amountToSlot; // optional: write the ACTUAL repaid amount
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

        IAaveV3Pool pool = registry.pool();
        ActionLib.AmountMode mode = ActionLib.AmountMode(p.mode);

        uint256 actual;
        if (mode == ActionLib.AmountMode.MAX_AVAILABLE) {
            actual = _repayMax(pool, p.asset);
        } else if (mode == ActionLib.AmountMode.TARGET_HF) {
            uint256 amount = _targetHfRepay(pool, p.asset, p.targetHealthFactor);
            if (amount > 0) actual = _repay(pool, p.asset, amount, amount);
        } else {
            uint256 amount;
            if (mode == ActionLib.AmountMode.FIXED) {
                amount = p.amount;
            } else if (mode == ActionLib.AmountMode.FROM_SLOT) {
                amount = ActionLib.readUint256Slot(ctx, p.amountFromSlot);
            } else {
                revert UnsupportedMode(p.mode);
            }
            if (amount == 0) revert ZeroAmount();
            actual = _repay(pool, p.asset, amount, amount);
        }

        (updatedSlots, updatedValues) = ActionLib.singleSlotDiff(
            p.amountToSlot,
            actual
        );
    }

    /// "Repay full debt": min(debt, balance), revert-free; no-op when either is 0.
    function _repayMax(
        IAaveV3Pool pool,
        address asset
    ) private returns (uint256) {
        uint256 debt = _variableDebt(pool, asset);
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (debt == 0 || balance == 0) return 0;

        // uint256.max lets Aave pull exactly the debt when we can cover it;
        // otherwise repay the whole balance. Approve the balance as a safe
        // upper bound for what the Pool may pull.
        uint256 repayArg = balance >= debt ? type(uint256).max : balance;
        return _repay(pool, asset, repayArg, balance);
    }

    function _repay(
        IAaveV3Pool pool,
        address asset,
        uint256 repayArg,
        uint256 approveAmount
    ) private returns (uint256 actual) {
        IERC20(asset).forceApprove(address(pool), approveAmount);
        actual = pool.repay(asset, repayArg, VARIABLE_RATE, address(this));
        IERC20(asset).forceApprove(address(pool), 0);
    }

    function _variableDebt(
        IAaveV3Pool pool,
        address asset
    ) private view returns (uint256) {
        address debtToken = pool.getReserveData(asset).variableDebtTokenAddress;
        if (debtToken == address(0)) return 0;
        return IERC20(debtToken).balanceOf(address(this));
    }

    /// Repay to RAISE the health factor to `targetHF`. No-op when there is no
    /// debt or the current HF is already ≥ target (wrong direction). Capped at
    /// the vault's token balance (best-effort).
    function _targetHfRepay(
        IAaveV3Pool pool,
        address asset,
        uint256 targetHF
    ) private view returns (uint256) {
        ActionLib.requireValidTargetHF(targetHF);
        (uint256 c, uint256 d, , uint256 lt, , ) = pool.getUserAccountData(address(this));
        if (d == 0) return 0; // nothing to repay

        uint256 targetDebt = ActionLib.targetDebtBase(
            ActionLib.normalizeBase(c),
            lt,
            targetHF
        );
        uint256 curDebt = ActionLib.normalizeBase(d);
        if (targetDebt >= curDebt) return 0; // already ≥ target HF
        uint256 reduceBase = curDebt - targetDebt;
        uint256 price = ActionLib.normalizeBase(
            IAaveOracle(registry.priceOracle()).getAssetPrice(asset)
        );
        uint256 tokens = ActionLib.baseToToken(
            reduceBase,
            price,
            IERC20Metadata(asset).decimals()
        );
        uint256 balance = IERC20(asset).balanceOf(address(this));
        return tokens < balance ? tokens : balance; // best-effort cap
    }
}
