// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IAction.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../interfaces/external/IPancakeV3Factory.sol";
import "../interfaces/external/IPancakeV3Pool.sol";
import "../registries/PancakeSwapV3Registry.sol";
import "../libraries/ActionLib.sol";

/**
 * @title PancakeSwapV3MintAction
 * @notice Opens a new PancakeSwap V3 concentrated-liquidity position from the
 *         vault via `NPM.mint`. Called via delegatecall — the position NFT is
 *         minted to the vault (which implements `onERC721Received`).
 *
 * Range modes
 * ───────────
 *   rangeMode 0 (explicit): the frontend computes `tickLower`/`tickUpper` from
 *     absolute prices off-chain (rounded outward to the tick spacing, sorted to
 *     the token0<token1 order); the action uses them as-is.
 *   rangeMode 1 (preset):  the frontend passes only `tickDelta` (a ±% band is a
 *     constant tick width). The action reads `pool.slot0().tick` and centers:
 *     tickLower/Upper = tick ∓ tickDelta, rounded outward to the spacing —
 *     robust to deploy→execution drift.
 *
 * Token ordering + approvals are automatic: the action sorts the pair and the
 * matching amounts, `forceApprove`s both tokens to the NPM and resets to 0 after.
 * `amount0Min = amount1Min = 0`, `deadline = block.timestamp`. The new position
 * token-id is written to the (required) output slot.
 *
 * Stateless: `registry` is `immutable`.
 */
contract PancakeSwapV3MintAction is IAction {
    using SafeERC20 for IERC20;

    PancakeSwapV3Registry public immutable registry;

    struct Params {
        address tokenA;
        address tokenB;
        uint24 fee;
        uint8 rangeMode; // 0 = explicit, 1 = preset
        int24 tickLower; // explicit
        int24 tickUpper; // explicit
        int24 tickDelta; // preset half-width
        uint256 amountADesired; // 0 = full balance of tokenA
        uint256 amountBDesired; // 0 = full balance of tokenB
        uint32 tokenIdToSlot; // required out slot
    }

    error ZeroToken();
    error SameToken();
    error InvalidTicks();
    error PoolNotFound();

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

        uint256 amountA = p.amountADesired == 0
            ? ActionLib.fullBalance(p.tokenA)
            : p.amountADesired;
        uint256 amountB = p.amountBDesired == 0
            ? ActionLib.fullBalance(p.tokenB)
            : p.amountBDesired;

        // Sort the pair (token0 < token1) and the matching amounts.
        (address token0, address token1, uint256 amount0, uint256 amount1) = p.tokenA <
            p.tokenB
            ? (p.tokenA, p.tokenB, amountA, amountB)
            : (p.tokenB, p.tokenA, amountB, amountA);

        (int24 tickLower, int24 tickUpper) = _resolveTicks(p, token0, token1);
        if (tickLower >= tickUpper) revert InvalidTicks();

        INonfungiblePositionManager npm = INonfungiblePositionManager(
            registry.positionManager()
        );

        IERC20(token0).forceApprove(address(npm), amount0);
        IERC20(token1).forceApprove(address(npm), amount1);

        (uint256 tokenId, , , ) = npm.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: p.fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp
            })
        );

        IERC20(token0).forceApprove(address(npm), 0);
        IERC20(token1).forceApprove(address(npm), 0);

        (updatedSlots, updatedValues) = ActionLib.singleSlotDiff(
            p.tokenIdToSlot,
            tokenId
        );
    }

    function _resolveTicks(
        Params memory p,
        address token0,
        address token1
    ) private view returns (int24 tickLower, int24 tickUpper) {
        if (p.rangeMode == 0) {
            return (p.tickLower, p.tickUpper); // explicit, computed off-chain
        }
        // Preset width — center on the live tick, rounded outward to spacing.
        address pool = registry.factory().getPool(token0, token1, p.fee);
        if (pool == address(0)) revert PoolNotFound();
        (, int24 tick, , , , , ) = IPancakeV3Pool(pool).slot0();
        int24 spacing = IPancakeV3Pool(pool).tickSpacing();
        tickLower = _roundDown(tick - p.tickDelta, spacing);
        tickUpper = _roundUp(tick + p.tickDelta, spacing);
        if (tickLower == tickUpper) tickUpper += spacing;
    }

    /// Round a tick DOWN to the spacing grid (floor — outward for the lower tick).
    function _roundDown(int24 tick, int24 spacing) private pure returns (int24) {
        int24 r = (tick / spacing) * spacing;
        if (tick < 0 && tick % spacing != 0) r -= spacing;
        return r;
    }

    /// Round a tick UP to the spacing grid (ceil — outward for the upper tick).
    function _roundUp(int24 tick, int24 spacing) private pure returns (int24) {
        int24 r = (tick / spacing) * spacing;
        if (tick > 0 && tick % spacing != 0) r += spacing;
        return r;
    }
}
