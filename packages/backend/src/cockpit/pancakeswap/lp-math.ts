/**
 * Pure Uniswap-V3 / PancakeSwap-V3 liquidity math (PRD: Modules → LpMath).
 *
 * Hand-rolled in **BigInt** (Q64.96 / Q128 — never `number`, which overflows) so
 * the backend snapshot cron can value LP positions without `@uniswap/v3-sdk`.
 * PancakeSwap V3 is a Uniswap-V3 fork → identical math. Verified by hard-fixture
 * unit tests against the canonical TickMath constants.
 */

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const Q96 = 2n ** 96n;
const Q32 = 2n ** 32n;
const MAX_UINT256 = 2n ** 256n - 1n;

/** TickMath.getSqrtRatioAtTick — exact integer port. Returns sqrtPriceX96. */
export function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = BigInt(tick < 0 ? -tick : tick);
  if (absTick > BigInt(MAX_TICK)) throw new Error('TickMath: T');

  let ratio =
    (absTick & 0x1n) !== 0n
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;
  if ((absTick & 0x2n) !== 0n) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4n) !== 0n) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8n) !== 0n) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10n) !== 0n) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20n) !== 0n) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40n) !== 0n) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80n) !== 0n) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100n) !== 0n) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200n) !== 0n) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400n) !== 0n) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800n) !== 0n) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 0x1000n) !== 0n) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000n) !== 0n) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000n) !== 0n) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000n) !== 0n) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000n) !== 0n) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 0x20000n) !== 0n) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000n) !== 0n) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000n) !== 0n) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) ratio = MAX_UINT256 / ratio;

  // sqrtPriceX96 = ceil(ratio / 2^32)
  return (ratio >> 32n) + (ratio % Q32 === 0n ? 0n : 1n);
}

function getAmount0(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return ((liquidity << 96n) * (sqrtB - sqrtA)) / sqrtB / sqrtA;
}

function getAmount1(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return (liquidity * (sqrtB - sqrtA)) / Q96;
}

/**
 * LiquidityAmounts.getAmountsForLiquidity — token0/token1 currently held by a
 * position, given the current sqrt price and the position's tick range.
 */
export function getAmountsForLiquidity(
  sqrtPriceX96: bigint,
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  let a = sqrtRatioAX96;
  let b = sqrtRatioBX96;
  if (a > b) [a, b] = [b, a];

  let amount0 = 0n;
  let amount1 = 0n;
  if (sqrtPriceX96 <= a) {
    amount0 = getAmount0(a, b, liquidity);
  } else if (sqrtPriceX96 < b) {
    amount0 = getAmount0(sqrtPriceX96, b, liquidity);
    amount1 = getAmount1(a, sqrtPriceX96, liquidity);
  } else {
    amount1 = getAmount1(a, b, liquidity);
  }
  return { amount0, amount1 };
}

/**
 * Single-sided **entry sizing** for a concentrated-liquidity position.
 *
 * The Wick-&-Wait strategy always starts from the vault's deposit token (one LP
 * leg). Given the current tick and the chosen range, this returns the fraction
 * (0..1) of the deposit token to swap into the *other* pool token so the resulting
 * two-token balance matches the position's required ratio at the current price; the
 * remainder of the deposit token is provided as-is.
 *
 * Off-chain hint (dust-tolerant — price impact/slippage are not modelled): the
 * recipe multiplies this by the deposit balance to get the swap amount.
 *
 * @param currentTick      pool.slot0().tick (or the TWAP tick)
 * @param tickLower        position lower tick
 * @param tickUpper        position upper tick
 * @param depositIsToken0  true when the vault deposit token is the pool's token0
 */
export function depositSwapFraction(
  currentTick: number,
  tickLower: number,
  tickUpper: number,
  depositIsToken0: boolean,
): number {
  if (tickLower >= tickUpper) throw new Error('lp-math: tickLower must be < tickUpper');
  const sp = getSqrtRatioAtTick(currentTick);
  const spa = getSqrtRatioAtTick(tickLower);
  const spb = getSqrtRatioAtTick(tickUpper);
  const { amount0, amount1 } = getAmountsForLiquidity(sp, spa, spb, Q96);

  // value0 (in token1 units) ∝ amount0 · price = amount0 · sp²/Q96². Compare value0
  // and value1 in the same scaled units (× Q96²) to keep BigInt precision.
  const v0 = amount0 * sp * sp;
  const v1 = amount1 * Q96 * Q96;
  const total = v0 + v1;
  // r0 = fraction of the position's value that must be held as token0.
  const r0 = total === 0n ? 0 : Number((v0 * 1_000_000_000_000_000_000n) / total) / 1e18;

  // Deposit is token0 → swap the token1 share (1 − r0); deposit is token1 → swap r0.
  return depositIsToken0 ? 1 - r0 : r0;
}
