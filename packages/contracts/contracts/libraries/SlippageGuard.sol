// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/external/IPancakeV3Factory.sol";
import "../interfaces/external/IPancakeV3Pool.sol";
import "../interfaces/external/IPancakeV3SwapRouter.sol";
import "./TickMath.sol";

/**
 * @title SlippageGuard
 * @notice The single place where this codebase swaps on PancakeSwap V3. Every
 *         swapping action routes through `swapExactInput`, so the minimum-out
 *         rule exists exactly once — a second copy would drift and the forgotten
 *         copy would be the unprotected one again.
 *
 * A pure Solidity `library` of `internal` functions: inlined into each action's
 * bytecode, no storage, delegatecall-safe. Under the vault's delegatecall
 * `address(this)` is the vault, so balances and the emitted event belong to it.
 *
 * The rule
 * ────────
 *   1. Reference price = the pool's time-weighted-average tick over `twapWindow`
 *      seconds (cumulative-tick oracle, same `observe` pattern as
 *      `WickWaitRebalanceCondition`). A sandwich has to move the average over the
 *      whole window, not just the block it front-runs.
 *   2. Expected output = amountIn, minus the pool's own swap fee, valued at that
 *      reference price. The fee is deducted because the router charges it before
 *      paying out — leaving it in would make the tolerance pay for the fee and a
 *      1 % fee tier would revert under any sane tolerance.
 *   3. `minOut = expected × (1 − tolerance)`, enforced by the router AND
 *      re-checked against the balance actually received (a fee-on-transfer
 *      output token can under-deliver without the router noticing).
 *
 * TWAP fallback (deliberate trade-off, PRD resolved question 2)
 * ────────────────────────────────────────────────────────────
 * `observe` reverts when the pool's observation cardinality does not cover the
 * window — common on young or thin pools. Reverting there would make the guard
 * an availability problem, so the reference falls back to the spot price with a
 * HALVED tolerance, and the event carries `spotFallback = true` so the weaker
 * path is recognisable afterwards. Availability before maximum manipulation
 * resistance, priced in by the tighter bound.
 *
 * Failing closed
 * ──────────────
 * Anything that would make the reference price meaningless reverts instead of
 * silently widening the bound: unknown pool, out-of-range tolerance or window,
 * a fee outside the router's own denominator, or price math that would overflow
 * (`Math.mulDiv` reverts on a 512-bit result that does not fit).
 */
library SlippageGuard {
    using SafeERC20 for IERC20;

    /// Everything one guarded swap needs. `factory` resolves the reference pool
    /// itself — a caller cannot point the guard at a pool of its choosing.
    struct SwapRequest {
        IPancakeV3SwapRouter router;
        IPancakeV3Factory factory;
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountIn;
        uint16 toleranceBps;
        uint32 twapWindow;
    }

    /// Q96 fixed-point one, the scale of a V3 `sqrtPriceX96`.
    uint256 private constant Q96 = 1 << 96;
    /// Basis-point denominator for the slippage tolerance.
    uint256 private constant BPS = 10_000;
    /// PancakeSwap V3 states pool fees in hundredths of a bip (1e6 = 100 %).
    uint256 private constant FEE_DENOMINATOR = 1_000_000;

    /**
     * Tolerance bounds, validated on-chain and mirrored by the step catalog's
     * paramSchema (one rule source — editor, backend and assistant inherit it).
     *
     * The floor is not zero on purpose: an unprotected swap is the hole this
     * guard closes, so "no tolerance" is not expressible. Below 0.1 % ordinary
     * fee rounding and one-block drift make execution unreliable; above 10 % a
     * bound stops being protection.
     */
    uint16 internal constant MIN_TOLERANCE_BPS = 10; // 0.1 %
    uint16 internal constant MAX_TOLERANCE_BPS = 1_000; // 10 %

    /**
     * TWAP window bounds — measured against live BSC pools, not assumed.
     *
     * The ceiling is not "as long as possible". A V3 pool answers `observe`
     * only as far back as its observation ring reaches, and that reach is
     * cardinality divided by how often the pool is written — on BSC's ~0.45 s
     * blocks the busiest tiers cycle their ring in well under an hour. A window
     * the pools cannot serve does not buy manipulation resistance: it silently
     * lands every swap in the spot fallback with the halved tolerance. An
     * allowed maximum has to be a window that actually gets served.
     *
     * Measured 2026-09-07 (BSC block 120_456_050, PancakeSwap V3), oracle reach
     * in seconds — spot value, and the low of 13 samples over the last 24 h:
     *
     *   USDT/WBNB  0.01 %   12_056   (24 h low  5_648)
     *   USDT/WBNB  0.05 %   24_590   (2-week low 19_033)
     *   USDT/WBNB  0.25 %   21_420   (2-week low 19_539)
     *   USDT/WBNB  1 %     176_453
     *   USDC/WBNB  0.01 %    3_864   (24 h low  1_566)  ← tightest deep pool
     *   BUSD/WBNB  0.05 %    1_263   (24 h low  1_039)  ← tightest overall
     *   CAKE/WBNB  0.05 %   13_704   (24 h low  4_268)
     *   BTCB/WBNB  0.05 %  125_340 · ETH/WBNB 0.05 % 116_139 · USDT/USDC 0.01 % 142_632
     *
     * 900 s clears the deep tiers with room to spare. It does NOT promise TWAP
     * coverage everywhere, and the measurement is what taught us that: the
     * thinnest pool (BUSD/WBNB 0.05 %) read 1_039 s as its 24 h low on
     * 2026-09-07 and 621 s two days later. Reach is ring size over write rate,
     * and both move — no constant can outrun that.
     *
     * So the ceiling does one thing honestly: it keeps out windows no pool ever
     * serves. Under the old 86_400 s, anyone asking for the longest allowed
     * window landed in the spot fallback every single time on every tier that
     * matters — the setting that reads as "most protection" bought the least.
     * That is fixed. Whether a chosen window fits the pool a user actually
     * picked is per-pool and current; it belongs in the editor as a warning
     * before signing, not in a constant here.
     *
     * The floor stays at 60 s: at the measured 0.450 s average block time that
     * is ~133 blocks, so an attacker has to hold a moved price across the whole
     * window rather than a block or two. No measurement here argues for raising
     * it — a longer floor only shrinks the usable range under a 900 s ceiling.
     */
    uint32 internal constant MIN_TWAP_WINDOW = 60; // 1 minute ≈ 133 BSC blocks
    uint32 internal constant MAX_TWAP_WINDOW = 900; // 15 minutes, see measurement above

    /**
     * @notice Emitted once per guarded swap, before the swap runs.
     * @param spotFallback true when the TWAP was unavailable and the spot price
     *        with halved tolerance was used instead — the marker that makes the
     *        weaker reference visible in the execution history.
     */
    event SwapMinOutEnforced(
        address indexed pool,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint16 effectiveToleranceBps,
        bool spotFallback
    );

    error ToleranceOutOfRange(uint16 toleranceBps);
    error TwapWindowOutOfRange(uint32 twapWindow);
    error InvalidPoolFee(uint24 fee);
    error SameToken();
    error PoolNotFound();
    error ReferencePriceUnavailable();
    error InsufficientOutput(uint256 received, uint256 minOut);

    /**
     * @notice Reject step parameters outside the on-chain bounds.
     * @dev Callers validate right after decoding so a bad parameter is rejected
     *      even on a path that ends up swapping nothing; `swapExactInput`
     *      validates again so the guard holds for every caller.
     */
    function requireValidBounds(uint16 toleranceBps, uint32 twapWindow) internal pure {
        if (toleranceBps < MIN_TOLERANCE_BPS || toleranceBps > MAX_TOLERANCE_BPS) {
            revert ToleranceOutOfRange(toleranceBps);
        }
        if (twapWindow < MIN_TWAP_WINDOW || twapWindow > MAX_TWAP_WINDOW) {
            revert TwapWindowOutOfRange(twapWindow);
        }
    }

    /**
     * @notice Swap `amountIn` of `tokenIn` for `tokenOut`, enforcing a minimum
     *         output derived from the pool's reference price.
     * @return amountOut the amount that actually landed here — the balance
     *         delta, not the router's claim.
     */
    function swapExactInput(SwapRequest memory r) internal returns (uint256 amountOut) {
        requireValidBounds(r.toleranceBps, r.twapWindow);
        if (r.fee >= FEE_DENOMINATOR) revert InvalidPoolFee(r.fee);
        if (r.tokenIn == r.tokenOut) revert SameToken();

        address pool = r.factory.getPool(r.tokenIn, r.tokenOut, r.fee);
        if (pool == address(0)) revert PoolNotFound();

        (uint160 sqrtPriceX96, bool spotFallback) = _referencePrice(pool, r.twapWindow);
        uint16 effectiveToleranceBps = spotFallback ? r.toleranceBps / 2 : r.toleranceBps;
        uint256 minOut = Math.mulDiv(
            _expectedOut(r.tokenIn, r.tokenOut, r.amountIn, r.fee, sqrtPriceX96),
            BPS - effectiveToleranceBps,
            BPS
        );

        emit SwapMinOutEnforced(
            pool,
            r.tokenIn,
            r.tokenOut,
            r.amountIn,
            minOut,
            effectiveToleranceBps,
            spotFallback
        );

        uint256 balanceBefore = IERC20(r.tokenOut).balanceOf(address(this));

        IERC20(r.tokenIn).forceApprove(address(r.router), r.amountIn);
        r.router.exactInputSingle(
            IPancakeV3SwapRouter.ExactInputSingleParams({
                tokenIn: r.tokenIn,
                tokenOut: r.tokenOut,
                fee: r.fee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: r.amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        IERC20(r.tokenIn).forceApprove(address(r.router), 0);

        amountOut = IERC20(r.tokenOut).balanceOf(address(this)) - balanceBefore;
        if (amountOut < minOut) revert InsufficientOutput(amountOut, minOut);
    }

    /**
     * Reference `sqrtPriceX96` for the pool: the TWAP over `w` seconds, or the
     * spot price when the cumulative-tick oracle cannot cover the window.
     */
    function _referencePrice(
        address pool,
        uint32 w
    ) private view returns (uint160 sqrtPriceX96, bool spotFallback) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = w;
        secondsAgos[1] = 0;

        try IPancakeV3Pool(pool).observe(secondsAgos) returns (
            int56[] memory tickCumulatives,
            uint160[] memory
        ) {
            // Arithmetic-mean tick, rounded toward −infinity for negative means
            // (matches Uniswap `OracleLibrary.consult` and the Wick-&-Wait read).
            int56 delta = tickCumulatives[1] - tickCumulatives[0];
            int56 window = int56(uint56(w));
            int24 meanTick = int24(delta / window);
            if (delta < 0 && delta % window != 0) meanTick--;
            return (TickMath.getSqrtRatioAtTick(meanTick), false);
        } catch {
            (uint160 spot, , , , , , ) = IPancakeV3Pool(pool).slot0();
            if (spot == 0) revert ReferencePriceUnavailable();
            return (spot, true);
        }
    }

    /**
     * Output `amountIn` should buy at `sqrtPriceX96`, net of the pool fee.
     *
     * A V3 pool's price is token1 per token0 in raw units, so no decimal
     * adjustment is needed; `token0` is the lower address by construction.
     *   tokenIn == token0 → out = in · (sqrtP/Q96)²
     *   tokenIn == token1 → out = in / (sqrtP/Q96)²
     * Both stages use full 512-bit `mulDiv`, so an extreme-price pool reverts
     * rather than silently truncating the bound.
     */
    function _expectedOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee,
        uint160 sqrtPriceX96
    ) private pure returns (uint256) {
        uint256 sqrtP = uint256(sqrtPriceX96);
        if (sqrtP == 0) revert ReferencePriceUnavailable();
        uint256 netIn = Math.mulDiv(amountIn, FEE_DENOMINATOR - fee, FEE_DENOMINATOR);

        if (tokenIn < tokenOut) {
            return Math.mulDiv(Math.mulDiv(netIn, sqrtP, Q96), sqrtP, Q96);
        }
        return Math.mulDiv(Math.mulDiv(netIn, Q96, sqrtP), Q96, sqrtP);
    }
}
