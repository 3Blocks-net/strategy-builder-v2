// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IAction.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../registries/PancakeSwapV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title PancakeSwapV3DecreaseLiquidityAction
 * @notice Removes liquidity from a PancakeSwap V3 position AND delivers the freed
 *         tokens to the vault in ONE step — bundling `decreaseLiquidity` then
 *         `collect(max, max)`. Called via delegatecall (the vault owns the NFT).
 *
 * This bundling is deliberate: `decreaseLiquidity` alone only accrues the freed
 * tokens (plus fees) to the position — the `collect` is what actually pulls them
 * into the vault. This is the single most common LP integration bug (PRD).
 *
 * The position token-id comes from a context slot; the amount removed is a
 * PERCENTAGE (1–100) of the live `positions().liquidity` (100 = all). No
 * approval needed — the vault is the position owner. `amountMin = 0`,
 * `deadline = block.timestamp`.
 *
 * Stateless: `registry` is `immutable`.
 */
contract PancakeSwapV3DecreaseLiquidityAction is IAction {
    uint128 private constant UINT128_MAX = type(uint128).max;

    PancakeSwapV3Registry public immutable registry;

    struct Params {
        uint32 tokenIdFromSlot; // required: read the position token-id from ctx
        uint16 percent; // 1..100 — percentage of liquidity to remove
    }

    error TokenIdSlotRequired();
    error InvalidPercent(uint16 percent);

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
        if (p.tokenIdFromSlot == ActionLib.NO_SLOT) revert TokenIdSlotRequired();
        if (p.percent == 0 || p.percent > 100) revert InvalidPercent(p.percent);

        uint256 tokenId = ActionLib.readUint256Slot(ctx, p.tokenIdFromSlot);

        INonfungiblePositionManager npm = INonfungiblePositionManager(
            registry.positionManager()
        );

        (, , , , , , , uint128 liquidity, , , , ) = npm.positions(tokenId);
        uint128 liquidityToRemove = uint128(
            (uint256(liquidity) * p.percent) / 100
        );

        if (liquidityToRemove > 0) {
            npm.decreaseLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: liquidityToRemove,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                })
            );
        }

        // Always collect — this is what delivers the freed tokens (plus any
        // accrued fees) to the vault. uint128.max pulls everything owed.
        npm.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: UINT128_MAX,
                amount1Max: UINT128_MAX
            })
        );

        // No context change.
        updatedSlots = new uint32[](0);
        updatedValues = new bytes[](0);
    }
}
