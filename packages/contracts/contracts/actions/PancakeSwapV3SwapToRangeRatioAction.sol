// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IAction.sol";
import "../interfaces/external/IPancakeV3Factory.sol";
import "../interfaces/external/IPancakeV3Pool.sol";
import "../registries/PancakeSwapV3Registry.sol";
import "../libraries/SlippageGuard.sol";
import "../libraries/TickMath.sol";

/**
 * @title PancakeSwapV3SwapToRangeRatioAction
 * @notice Sizes a concentrated-liquidity position **at execution time**: reads the
 *         live pool price, centers the same range a following Mint(rangeMode 1)
 *         will use (`tick ± tickDelta`, rounded to spacing), works out the target
 *         token0/token1 value ratio for that range, and swaps the over-represented
 *         token toward it via the router. A later `Mint(full balance)` then mints
 *         whatever is held (residual is dust).
 *
 * Why an action (not off-chain): the strategy's automations fire at a keeper-chosen
 * time, so a swap amount fixed at build time is stale. Works for entry (the vault
 * holds only the deposit token) and rebalance (both tokens after Collect) alike.
 *
 * Single-pass: the target ratio is computed from the pre-swap price and ignores the
 * swap's own price impact — the leftover is dust. Delegatecall — runs in the vault's
 * storage/balance context; no state variables (`registry` is immutable).
 *
 * Price protection: the swap leg runs through `SlippageGuard`, the same shared
 * implementation `PancakeSwapV3SwapAction` uses — one minimum-out rule, no second
 * copy to drift. The tolerance is validated up front, so a bad parameter is rejected
 * even when the holding is already balanced and nothing would be swapped.
 *
 * Params (ABI):
 *   address tokenA               – one pool token (typically the deposit token)
 *   address tokenB               – the other pool token
 *   uint24  fee                  – pool fee tier
 *   int24   tickDelta            – preset half-width (must match the following Mint)
 *   uint16  slippageToleranceBps – mandatory, SlippageGuard bounds
 *   uint32  twapWindow           – reference window in seconds
 */
contract PancakeSwapV3SwapToRangeRatioAction is IAction {
    PancakeSwapV3Registry public immutable registry;

    struct Params {
        address tokenA;
        address tokenB;
        uint24 fee;
        int24 tickDelta;
        uint16 slippageToleranceBps;
        uint32 twapWindow;
    }

    error ZeroToken();
    error SameToken();
    error PoolNotFound();
    error SqrtPriceTooHigh();

    uint256 private constant Q96 = 1 << 96;

    constructor(address registry_) {
        require(registry_ != address(0), "registry=0");
        registry = PancakeSwapV3Registry(registry_);
    }

    function execute(
        bytes calldata params,
        bytes[] calldata
    ) external override returns (uint32[] memory updatedSlots, bytes[] memory updatedValues) {
        Params memory p = abi.decode(params, (Params));
        if (p.tokenA == address(0) || p.tokenB == address(0)) revert ZeroToken();
        if (p.tokenA == p.tokenB) revert SameToken();
        SlippageGuard.requireValidBounds(p.slippageToleranceBps, p.twapWindow);

        (address token0, address token1) = p.tokenA < p.tokenB
            ? (p.tokenA, p.tokenB)
            : (p.tokenB, p.tokenA);

        address pool = registry.factory().getPool(token0, token1, p.fee);
        if (pool == address(0)) revert PoolNotFound();

        (uint160 sqrtP, int24 tick, , , , , ) = IPancakeV3Pool(pool).slot0();
        int24 spacing = IPancakeV3Pool(pool).tickSpacing();
        int24 tickLower = _roundDown(tick - p.tickDelta, spacing);
        int24 tickUpper = _roundUp(tick + p.tickDelta, spacing);
        // Same degenerate-range guard as the Mint action — keep the effective range
        // identical so the swap sizes for exactly the range Mint will open.
        if (tickLower == tickUpper) tickUpper += spacing;

        uint256 sa = TickMath.getSqrtRatioAtTick(tickLower);
        uint256 sb = TickMath.getSqrtRatioAtTick(tickUpper);
        uint256 sp = uint256(sqrtP);
        if (sp < sa) sp = sa;
        if (sp > sb) sp = sb;

        // Target token0 value fraction r0 = A / (A + B):
        //   A = sp·(sb − sp)/sb   (∝ value of the token0 leg)
        //   B = sp − sa           (∝ value of the token1 leg)
        // sqrtPriceX96 is uint160 (max ≈ 2^160). For the targeted BSC pairs sp,sb stay
        // below 2^128 so sp·(sb−sp) < 2^256 — fail fast otherwise (extreme-price pools
        // would need FullMath.mulDiv; tracked as a follow-up).
        if (sb > type(uint128).max) revert SqrtPriceTooHigh();
        uint256 A = (sp * (sb - sp)) / sb;
        uint256 B = sp - sa;
        uint256 denom = A + B;
        if (denom == 0) return (new uint32[](0), new bytes[](0));

        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));

        // value0 in token1 units = bal0 · price = bal0 · sp²/Q96² (staged to avoid overflow).
        uint256 value0 = _mulSpDivQ96(_mulSpDivQ96(bal0, sp), sp);
        uint256 V = value0 + bal1;
        uint256 targetValue0 = (V * A) / denom;

        if (value0 > targetValue0) {
            // Too much token0 → swap the excess (in token1 units) back to token0 amount.
            uint256 excess1 = value0 - targetValue0;
            uint256 amountIn = _divSpMulQ96(_divSpMulQ96(excess1, sp), sp); // excess1 / price
            if (amountIn > bal0) amountIn = bal0;
            _swap(token0, token1, p, amountIn);
        } else if (targetValue0 > value0) {
            // Too little token0 → swap token1 (token1 units == token1 amount) into token0.
            uint256 amountIn = targetValue0 - value0;
            if (amountIn > bal1) amountIn = bal1;
            _swap(token1, token0, p, amountIn);
        }
        // else already balanced → no-op.

        return (new uint32[](0), new bytes[](0));
    }

    /// The one swap leg — routed through the shared guard, never inlined here.
    function _swap(
        address tokenIn,
        address tokenOut,
        Params memory p,
        uint256 amountIn
    ) private {
        if (amountIn == 0) return;
        SlippageGuard.swapExactInput(
            SlippageGuard.SwapRequest({
                router: registry.swapRouter(),
                factory: registry.factory(),
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: p.fee,
                amountIn: amountIn,
                toleranceBps: p.slippageToleranceBps,
                twapWindow: p.twapWindow
            })
        );
    }

    /// x · sp / Q96 — one stage of multiplying by the sqrt price.
    function _mulSpDivQ96(uint256 x, uint256 sp) private pure returns (uint256) {
        return (x * sp) / Q96;
    }

    /// x · Q96 / sp — one stage of dividing by the sqrt price.
    function _divSpMulQ96(uint256 x, uint256 sp) private pure returns (uint256) {
        return (x * Q96) / sp;
    }

    function _roundDown(int24 tick, int24 spacing) private pure returns (int24) {
        int24 r = (tick / spacing) * spacing;
        if (tick < 0 && tick % spacing != 0) r -= spacing;
        return r;
    }

    function _roundUp(int24 tick, int24 spacing) private pure returns (int24) {
        int24 r = (tick / spacing) * spacing;
        if (tick > 0 && tick % spacing != 0) r += spacing;
        return r;
    }
}
