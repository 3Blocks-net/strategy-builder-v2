// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IPancakeV3SwapRouter
 * @notice Minimal interface for PancakeSwap V3's SwapRouter. The
 *         `ExactInputSingleParams` struct carries an explicit `deadline` (PCS V3
 *         forked the older Uniswap V3 periphery), set to `block.timestamp` by the
 *         action.
 */
interface IPancakeV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
}
