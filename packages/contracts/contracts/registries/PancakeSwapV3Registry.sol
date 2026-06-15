// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/external/IPancakeV3SwapRouter.sol";
import "../interfaces/external/IPancakeV3Factory.sol";

/**
 * @title PancakeSwapV3Registry
 * @notice Per-protocol address registry for the PancakeSwap V3 actions. Stores
 *         the `SwapRouter`, `NonfungiblePositionManager` and `Factory` as three
 *         direct `immutable`s. No oracle (swaps ship without on-chain
 *         minimum-out — see PRD).
 *
 *         Immutable by design — no owner, no setters. Re-targeting a chain means
 *         deploying a new registry and repointing the actions.
 */
contract PancakeSwapV3Registry {
    IPancakeV3SwapRouter public immutable swapRouter;
    address public immutable positionManager;
    IPancakeV3Factory public immutable factory;

    error ZeroAddress();

    constructor(
        address swapRouter_,
        address positionManager_,
        address factory_
    ) {
        if (
            swapRouter_ == address(0) ||
            positionManager_ == address(0) ||
            factory_ == address(0)
        ) revert ZeroAddress();
        swapRouter = IPancakeV3SwapRouter(swapRouter_);
        positionManager = positionManager_;
        factory = IPancakeV3Factory(factory_);
    }
}
