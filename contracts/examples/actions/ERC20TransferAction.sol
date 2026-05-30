// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IAction.sol";
import "../../interfaces/IFeeRegistry.sol";

/**
 * @title ERC20TransferAction
 * @notice Transfers ERC-20 tokens from the vault to a recipient, optionally
 *         deducting a withdraw fee and sending it to FeeRegistry.
 *         Called via delegatecall — executes in the vault's context.
 *
 * Fee handling
 * ─────────────
 * When feeRegistry != address(0), the action reads the current withdrawFeeBps
 * from FeeRegistry, deducts the fee from the transfer amount, and sends
 * (amount - fee) to the recipient and fee to FeeRegistry via collectFee.
 *
 * Context wiring
 * ──────────────
 * amountFromSlot – if != NO_SLOT, read the transfer amount from ctx[slot].
 * amountToSlot   – if != NO_SLOT, write the actual transferred amount to ctx[slot].
 *
 * IMPORTANT: No state variables declared here — stateless by design.
 */
contract ERC20TransferAction is IAction {
    using SafeERC20 for IERC20;

    uint32 private constant NO_SLOT = type(uint32).max;

    struct Params {
        address token;
        address recipient;
        uint256 amount;
        uint32  amountFromSlot;
        uint32  amountToSlot;
        address feeRegistry;
    }

    error ZeroToken();
    error ZeroRecipient();
    error SlotOutOfBounds(uint32 slot);

    function execute(
        bytes calldata params,
        bytes[] calldata ctx
    ) external override returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues
    ) {
        Params memory p = abi.decode(params, (Params));

        if (p.token     == address(0)) revert ZeroToken();
        if (p.recipient == address(0)) revert ZeroRecipient();

        // --- Resolve transfer amount ---
        uint256 transferAmount;
        if (p.amountFromSlot != NO_SLOT) {
            if (p.amountFromSlot >= uint32(ctx.length))
                revert SlotOutOfBounds(p.amountFromSlot);
            transferAmount = abi.decode(ctx[p.amountFromSlot], (uint256));
        } else if (p.amount == 0) {
            transferAmount = IERC20(p.token).balanceOf(address(this));
        } else {
            transferAmount = p.amount;
        }

        // --- Deduct withdraw fee and transfer ---
        uint256 fee = 0;
        if (p.feeRegistry != address(0) && transferAmount > 0) {
            uint16 feeBps = IFeeRegistry(p.feeRegistry).withdrawFeeBps();
            if (feeBps > 0) {
                fee = (transferAmount * feeBps) / 10_000;
            }
        }

        if (transferAmount > fee) {
            IERC20(p.token).safeTransfer(p.recipient, transferAmount - fee);
        }

        if (fee > 0) {
            IERC20(p.token).forceApprove(p.feeRegistry, fee);
            IFeeRegistry(p.feeRegistry).collectFee(p.token, fee);
        }

        // --- Write output to context diff (if requested) ---
        if (p.amountToSlot != NO_SLOT) {
            updatedSlots = new uint32[](1);
            updatedValues = new bytes[](1);
            updatedSlots[0] = p.amountToSlot;
            updatedValues[0] = abi.encode(transferAmount);
        }
    }
}
