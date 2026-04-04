// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IAction.sol";

/**
 * @title ERC20TransferAction
 * @notice Transfers ERC-20 tokens from the vault to a recipient.
 *         Called via delegatecall — executes in the vault's context, so
 *         address(this) == vault and the vault's token balance is used.
 *
 * Context wiring
 * ──────────────
 * amountFromSlot – if != NO_SLOT, read the transfer amount from ctx[slot]
 *                  instead of the static `amount` field.
 * amountToSlot   – if != NO_SLOT, write the actual transferred amount to ctx[slot].
 *
 * Volume / fee
 * ─────────────
 * Returns (volumeToken = token, volumeAmount = transferAmount) so the vault can
 * look up the USD price via its configured IPriceOracle and compute the fee.
 * If the transfer amount resolves to zero no volume is reported.
 *
 * Params encoding (ABI):
 *   address token           – ERC-20 token to transfer
 *   address recipient       – destination address (must not be address(0))
 *   uint256 amount          – static amount (0 = full vault balance when amountFromSlot == NO_SLOT)
 *   uint32  amountFromSlot  – context slot to read amount from  (NO_SLOT = use static)
 *   uint32  amountToSlot    – context slot to write amount into (NO_SLOT = no output)
 *
 * IMPORTANT: No state variables declared here — stateless by design.
 *            Any storage access operates on the vault's storage layout.
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
    }

    error ZeroToken();
    error ZeroRecipient();
    error SlotOutOfBounds(uint32 slot);

    function execute(
        bytes calldata params,
        bytes[] calldata ctx
    ) external override returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues,
        address volumeToken,
        uint256 volumeAmount
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
            // "Transfer full balance" shortcut: reads live balance at execution time.
            transferAmount = IERC20(p.token).balanceOf(address(this));
        } else {
            transferAmount = p.amount;
        }

        // --- Execute transfer (delegatecall: address(this) == vault) ---
        IERC20(p.token).safeTransfer(p.recipient, transferAmount);

        // --- Report volume for fee tracking ---
        if (transferAmount > 0) {
            volumeToken  = p.token;
            volumeAmount = transferAmount;
        }

        // --- Write output to context diff (if requested) ---
        if (p.amountToSlot != NO_SLOT) {
            updatedSlots = new uint32[](1);
            updatedValues = new bytes[](1);
            updatedSlots[0] = p.amountToSlot;
            updatedValues[0] = abi.encode(transferAmount);
        }
        // If amountToSlot == NO_SLOT, both arrays remain empty → no context update.
    }
}
