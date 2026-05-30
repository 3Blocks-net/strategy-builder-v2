// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IAction.sol";
import "../../interfaces/IFeeRegistry.sol";

/**
 * @title FeeDepositAction
 * @notice Action that tops up the vault's gas compensation deposit in FeeRegistry
 *         whenever it drops below the vault's configured minimum.
 *
 * How it works (called via delegatecall — address(this) == vault)
 * ──────────────────────────────────────────────────────────────
 * 1. Reads the vault's current deposit: IFeeRegistry.vaultDeposit(address(this), token)
 * 2. Reads the vault's minimum: IVaultMinDeposit(address(this)).minFeeDeposit()
 * 3. If current >= minimum → no-op.
 * 4. Otherwise computes topUp = min(topUpAmount, vault's token balance).
 *    If topUpAmount == 0, fills exactly to the minimum.
 * 5. Approves FeeRegistry and calls depositFor.
 *
 * IMPORTANT: No state variables — stateless by design.
 */
/// @dev Minimal interface to read the vault's minimum deposit setting.
interface IVaultMinDeposit {
    function minFeeDeposit() external view returns (uint256);
}

contract FeeDepositAction is IAction {
    using SafeERC20 for IERC20;

    struct Params {
        address feeRegistry;
        address token;
        uint256 topUpAmount;
    }

    error ZeroFeeRegistry();
    error ZeroToken();

    function execute(
        bytes calldata params,
        bytes[] calldata /* ctx */
    ) external override returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues
    ) {
        Params memory p = abi.decode(params, (Params));
        if (p.feeRegistry == address(0)) revert ZeroFeeRegistry();
        if (p.token       == address(0)) revert ZeroToken();

        uint256 current = IFeeRegistry(p.feeRegistry).vaultDeposit(address(this), p.token);
        uint256 minimum = IVaultMinDeposit(address(this)).minFeeDeposit();

        if (minimum == 0 || current >= minimum) {
            return (updatedSlots, updatedValues);
        }

        uint256 needed;
        if (p.topUpAmount > 0) {
            needed = p.topUpAmount;
        } else {
            needed = minimum - current;
        }

        uint256 available = IERC20(p.token).balanceOf(address(this));
        uint256 toDeposit = needed > available ? available : needed;

        if (toDeposit == 0) {
            return (updatedSlots, updatedValues);
        }

        IERC20(p.token).forceApprove(p.feeRegistry, toDeposit);
        IFeeRegistry(p.feeRegistry).depositFor(address(this), p.token, toDeposit);
    }
}
