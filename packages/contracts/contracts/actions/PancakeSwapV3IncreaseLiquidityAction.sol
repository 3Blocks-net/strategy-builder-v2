// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IAction.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../registries/PancakeSwapV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title PancakeSwapV3IncreaseLiquidityAction
 * @notice Adds liquidity to an existing PancakeSwap V3 position (identified by a
 *         token-id read from a context slot, e.g. written by an earlier Mint).
 *         Called via delegatecall.
 *
 * Amounts use the usual conventions per token: FROM_SLOT (slot) · full balance
 * (amount = 0) · FIXED. The pair is sorted to token0<token1 (with matching
 * amounts) so the desired amounts line up with the position. No tick centering
 * — the position already carries its ticks. `amount0Min = amount1Min = 0`,
 * `deadline = block.timestamp`. Both approvals to the NPM are reset to 0 after.
 *
 * Stateless: `registry` is `immutable`.
 */
contract PancakeSwapV3IncreaseLiquidityAction is IAction {
    using SafeERC20 for IERC20;

    PancakeSwapV3Registry public immutable registry;

    struct Params {
        address tokenA;
        address tokenB;
        uint32 tokenIdFromSlot; // required: read the position token-id from ctx
        uint256 amountADesired; // 0 = full balance of tokenA
        uint32 amountAFromSlot; // NO_SLOT = static / full
        uint256 amountBDesired; // 0 = full balance of tokenB
        uint32 amountBFromSlot; // NO_SLOT = static / full
    }

    error ZeroToken();
    error SameToken();
    error TokenIdSlotRequired();

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
        if (p.tokenA == address(0) || p.tokenB == address(0)) revert ZeroToken();
        if (p.tokenA == p.tokenB) revert SameToken();
        if (p.tokenIdFromSlot == ActionLib.NO_SLOT) revert TokenIdSlotRequired();

        uint256 tokenId = ActionLib.readUint256Slot(ctx, p.tokenIdFromSlot);

        uint256 amountA = _resolveAmount(p.tokenA, p.amountADesired, p.amountAFromSlot, ctx);
        uint256 amountB = _resolveAmount(p.tokenB, p.amountBDesired, p.amountBFromSlot, ctx);

        (address token0, address token1, uint256 amount0, uint256 amount1) = p.tokenA <
            p.tokenB
            ? (p.tokenA, p.tokenB, amountA, amountB)
            : (p.tokenB, p.tokenA, amountB, amountA);

        INonfungiblePositionManager npm = INonfungiblePositionManager(
            registry.positionManager()
        );

        IERC20(token0).forceApprove(address(npm), amount0);
        IERC20(token1).forceApprove(address(npm), amount1);

        npm.increaseLiquidity(
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: tokenId,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );

        IERC20(token0).forceApprove(address(npm), 0);
        IERC20(token1).forceApprove(address(npm), 0);

        // No context change.
        updatedSlots = new uint32[](0);
        updatedValues = new bytes[](0);
    }

    function _resolveAmount(
        address token,
        uint256 amountDesired,
        uint32 amountFromSlot,
        bytes[] calldata ctx
    ) private view returns (uint256) {
        if (amountFromSlot != ActionLib.NO_SLOT) {
            return ActionLib.readUint256Slot(ctx, amountFromSlot);
        }
        if (amountDesired == 0) {
            return ActionLib.fullBalance(token);
        }
        return amountDesired;
    }
}
