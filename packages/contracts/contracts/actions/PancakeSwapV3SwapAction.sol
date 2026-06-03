// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IAction.sol";
import "../interfaces/external/IPancakeV3SwapRouter.sol";
import "../registries/PancakeSwapV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title PancakeSwapV3SwapAction
 * @notice Swaps one token for another via PancakeSwap V3 `exactInputSingle`.
 *         Called via delegatecall — input/output tokens belong to the vault.
 *
 * Price protection — removed by design (PRD)
 * ──────────────────────────────────────────
 * Ships with `amountOutMinimum = 0` and `sqrtPriceLimitX96 = 0`: the product
 * priority is that the step EXECUTES rather than reverting mid-strategy. The
 * MEV/sandwich exposure on a public-executor swap is a consciously accepted MVP
 * risk. The struct keeps an optional static `amountOutMinimum` (+ `minOutFromSlot`,
 * both default 0) so a future "protected swap" can turn protection on WITHOUT a
 * contract redeploy.
 *
 * Input amount: FROM_SLOT (slot) · full balance (amountIn = 0) · FIXED.
 * `deadline = block.timestamp`. Approval to the router is reset to 0 after.
 * The output amount is written to the optional output slot.
 *
 * Stateless: `registry` is `immutable` (bytecode, delegatecall-safe).
 */
contract PancakeSwapV3SwapAction is IAction {
    using SafeERC20 for IERC20;

    PancakeSwapV3Registry public immutable registry;

    struct Params {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountIn; // 0 = full vault balance of tokenIn
        uint32 amountInFromSlot; // NO_SLOT = static / full balance
        uint32 amountOutToSlot; // NO_SLOT = no write
        uint256 amountOutMinimum; // forward-compat (default 0)
        uint32 minOutFromSlot; // forward-compat (NO_SLOT)
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

        uint256 amountIn;
        if (p.amountInFromSlot != ActionLib.NO_SLOT) {
            amountIn = ActionLib.readUint256Slot(ctx, p.amountInFromSlot);
        } else if (p.amountIn == 0) {
            amountIn = ActionLib.fullBalance(p.tokenIn);
        } else {
            amountIn = p.amountIn;
        }
        if (amountIn == 0) revert ZeroAmount();

        uint256 minOut = p.minOutFromSlot != ActionLib.NO_SLOT
            ? ActionLib.readUint256Slot(ctx, p.minOutFromSlot)
            : p.amountOutMinimum;

        IPancakeV3SwapRouter router = registry.swapRouter();
        IERC20(p.tokenIn).forceApprove(address(router), amountIn);

        uint256 amountOut = router.exactInputSingle(
            IPancakeV3SwapRouter.ExactInputSingleParams({
                tokenIn: p.tokenIn,
                tokenOut: p.tokenOut,
                fee: p.fee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: minOut, // 0 by design
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(p.tokenIn).forceApprove(address(router), 0);

        (updatedSlots, updatedValues) = ActionLib.singleSlotDiff(
            p.amountOutToSlot,
            amountOut
        );
    }
}
