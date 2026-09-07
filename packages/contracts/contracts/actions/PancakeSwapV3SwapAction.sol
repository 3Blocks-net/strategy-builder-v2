// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IAction.sol";
import "../registries/PancakeSwapV3Registry.sol";
import "../libraries/ActionLib.sol";
import "../libraries/SlippageGuard.sol";

/**
 * @title PancakeSwapV3SwapAction
 * @notice Swaps one token for another via PancakeSwap V3 `exactInputSingle`.
 *         Called via delegatecall — input/output tokens belong to the vault.
 *
 * Price protection
 * ────────────────
 * The step carries a mandatory slippage tolerance in basis points. At execution
 * time `SlippageGuard` derives the minimum output from the pool's TWAP over
 * `twapWindow` seconds (spot with halved tolerance when the oracle cannot cover
 * the window) and the swap reverts below it. The whole rule lives in the guard,
 * shared with `PancakeSwapV3SwapToRangeRatioAction` — see that library for the
 * bounds and the fallback trade-off.
 *
 * This replaces the MVP's `amountOutMinimum` / `minOutFromSlot` placeholder
 * pair, which shipped as a static 0 and left every swap sandwichable.
 *
 * Input amount: FROM_SLOT (slot) · full balance (amountIn = 0) · FIXED.
 * `deadline = block.timestamp`. Approval to the router is reset to 0 after.
 * The output amount is written to the optional output slot.
 *
 * Stateless: `registry` is `immutable` (bytecode, delegatecall-safe).
 */
contract PancakeSwapV3SwapAction is IAction {
    PancakeSwapV3Registry public immutable registry;

    struct Params {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountIn; // 0 = full vault balance of tokenIn
        uint32 amountInFromSlot; // NO_SLOT = static / full balance
        uint32 amountOutToSlot; // NO_SLOT = no write
        uint16 slippageToleranceBps; // mandatory, SlippageGuard bounds
        uint32 twapWindow; // reference window in seconds
    }

    error ZeroTokenIn();
    error ZeroTokenOut();
    error ZeroAmount();

    constructor(address registry_) {
        require(registry_ != address(0), "registry=0");
        registry = PancakeSwapV3Registry(registry_);
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
        if (p.tokenIn == address(0)) revert ZeroTokenIn();
        if (p.tokenOut == address(0)) revert ZeroTokenOut();
        SlippageGuard.requireValidBounds(p.slippageToleranceBps, p.twapWindow);

        uint256 amountIn;
        if (p.amountInFromSlot != ActionLib.NO_SLOT) {
            amountIn = ActionLib.readUint256Slot(ctx, p.amountInFromSlot);
        } else if (p.amountIn == 0) {
            amountIn = ActionLib.fullBalance(p.tokenIn);
        } else {
            amountIn = p.amountIn;
        }
        if (amountIn == 0) revert ZeroAmount();

        uint256 amountOut = SlippageGuard.swapExactInput(
            SlippageGuard.SwapRequest({
                router: registry.swapRouter(),
                factory: registry.factory(),
                tokenIn: p.tokenIn,
                tokenOut: p.tokenOut,
                fee: p.fee,
                amountIn: amountIn,
                toleranceBps: p.slippageToleranceBps,
                twapWindow: p.twapWindow
            })
        );

        (updatedSlots, updatedValues) = ActionLib.singleSlotDiff(
            p.amountOutToSlot,
            amountOut
        );
    }
}
