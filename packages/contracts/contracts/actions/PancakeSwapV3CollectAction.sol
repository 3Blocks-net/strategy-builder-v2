// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IAction.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../registries/PancakeSwapV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title PancakeSwapV3CollectAction
 * @notice Collects accrued fees (and any owed tokens) from a PancakeSwap V3
 *         position into the vault — automated LP-reward harvesting. Called via
 *         delegatecall (the vault owns the NFT).
 *
 * The position token-id comes from a context slot. The action calls
 * `NPM.collect(amount0Max = amount1Max = type(uint128).max)`, sweeping everything
 * collectable to the vault. No approval needed.
 *
 * Stateless: `registry` is `immutable`.
 */
contract PancakeSwapV3CollectAction is IAction {
    uint128 private constant UINT128_MAX = type(uint128).max;

    PancakeSwapV3Registry public immutable registry;

    struct Params {
        uint32 tokenIdFromSlot; // required: read the position token-id from ctx
    }

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
        if (p.tokenIdFromSlot == ActionLib.NO_SLOT) revert TokenIdSlotRequired();

        uint256 tokenId = ActionLib.readUint256Slot(ctx, p.tokenIdFromSlot);

        INonfungiblePositionManager(registry.positionManager()).collect(
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
