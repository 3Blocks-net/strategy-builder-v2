// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IAction.sol";
import "../../interfaces/IFeeRegistry.sol";

/**
 * @title FeeDepositAction
 * @notice Action that tops up the vault's fee deposit in FeeRegistry whenever
 *         it drops below the vault's configured minimum.
 *
 *         Add this as a step AFTER a fee-generating action so that tokens
 *         the vault just received can immediately be set aside for future fees.
 *
 * How it works (called via delegatecall — address(this) == vault)
 * ──────────────────────────────────────────────────────────────
 * 1. Reads the vault's current deposit: IFeeRegistry.vaultDeposit(address(this), token)
 * 2. Reads the vault's minimum: IVaultMinDeposit(address(this)).minFeeDeposit()
 * 3. If current >= minimum → no-op, returns immediately.
 * 4. Otherwise computes topUp = min(topUpAmount, vault's token balance).
 *    If topUpAmount == 0 in params, fills exactly to the minimum.
 * 5. Approves FeeRegistry for topUp tokens (revoked implicitly by transferFrom).
 * 6. Calls IFeeRegistry.depositFor(address(this), token, topUp).
 *
 * Volume: this action does not represent fee-bearing volume — returns
 * (address(0), 0) so no fee is accrued for the top-up step itself.
 *
 * Params encoding (ABI):
 *   address feeRegistry  – FeeRegistry contract address
 *   address token        – ERC-20 fee token to deposit (must be accepted)
 *   uint256 topUpAmount  – fixed amount to add (0 = fill exactly to minFeeDeposit)
 *
 * IMPORTANT: No state variables declared here — stateless by design.
 *            Any storage access operates on the vault's storage layout.
 */
/// @dev Minimal interface to read the vault's minimum deposit setting.
///      Called on address(this) (= vault) while running in delegatecall context.
interface IVaultMinDeposit {
    function minFeeDeposit() external view returns (uint256);
}

contract FeeDepositAction is IAction {
    using SafeERC20 for IERC20;

    struct Params {
        address feeRegistry;
        address token;
        uint256 topUpAmount; // 0 = fill to vault's minFeeDeposit
    }

    error ZeroFeeRegistry();
    error ZeroToken();

    function execute(
        bytes calldata params,
        bytes[] calldata /* ctx */
    ) external override returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues,
        address volumeToken,
        uint256 volumeAmount
    ) {
        Params memory p = abi.decode(params, (Params));
        if (p.feeRegistry == address(0)) revert ZeroFeeRegistry();
        if (p.token       == address(0)) revert ZeroToken();

        // ── 1. Read current deposit and vault minimum ────────────────────────
        uint256 current = IFeeRegistry(p.feeRegistry).vaultDeposit(address(this), p.token);
        uint256 minimum = IVaultMinDeposit(address(this)).minFeeDeposit();

        // ── 2. Already sufficient — nothing to do ───────────────────────────
        if (minimum == 0 || current >= minimum) {
            return (updatedSlots, updatedValues, address(0), 0);
        }

        // ── 3. Compute how much to deposit ──────────────────────────────────
        uint256 needed;
        if (p.topUpAmount > 0) {
            // Fixed top-up amount regardless of the gap
            needed = p.topUpAmount;
        } else {
            // Fill exactly to the minimum
            needed = minimum - current;
        }

        // Cap to the vault's available token balance (never revert on shortage).
        uint256 available = IERC20(p.token).balanceOf(address(this));
        uint256 toDeposit = needed > available ? available : needed;

        if (toDeposit == 0) {
            return (updatedSlots, updatedValues, address(0), 0);
        }

        // ── 4. Approve and deposit into FeeRegistry ──────────────────────────
        // forceApprove resets allowance to 0 first (safe for USDT-style tokens).
        IERC20(p.token).forceApprove(p.feeRegistry, toDeposit);
        IFeeRegistry(p.feeRegistry).depositFor(address(this), p.token, toDeposit);

        // No volumeToken / volumeAmount — top-ups are not fee-bearing volume.
        // No context diff — nothing written to shared context slots.
    }
}
