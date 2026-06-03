/**
 * PancakeSwap V3 tick math (off-chain, for the `tick-range` widget).
 *
 * Explicit-range mode computes `tickLower`/`tickUpper` from absolute prices,
 * rounded OUTWARD to the fee tier's tick spacing and sorted to the token0<token1
 * order (inverting the price + swapping lower/upper when the user's Token A is
 * actually token1). Preset-width mode computes a constant `tickDelta` from a ±%
 * band — centering happens on-chain in the Mint action. No slot0 read here.
 */

const LN_1_0001 = Math.log(1.0001);

/** PancakeSwap V3 tick spacing per fee tier. */
export function feeToSpacing(fee: number): number {
  switch (fee) {
    case 100:
      return 1;
    case 500:
      return 10;
    case 2500:
      return 50;
    case 10000:
      return 200;
    default:
      return 10;
  }
}

/**
 * Convert a human price (1 token0 = `price` token1) to a raw tick.
 * tick = log_{1.0001}(price × 10^(dec1 − dec0)).
 */
export function priceToTick(price: number, dec0: number, dec1: number): number {
  const adjusted = price * 10 ** (dec1 - dec0);
  return Math.log(adjusted) / LN_1_0001;
}

export function roundTickDown(tick: number, spacing: number): number {
  return Math.floor(tick / spacing) * spacing;
}

export function roundTickUp(tick: number, spacing: number): number {
  return Math.ceil(tick / spacing) * spacing;
}

/** Constant half-width (in ticks) for a ±pct% band. */
export function presetTickDelta(pct: number): number {
  return Math.round(Math.log(1 + pct / 100) / LN_1_0001);
}

export interface ExplicitTicksInput {
  minPrice: number; // price of Token A in Token B (1 A = minPrice B)
  maxPrice: number;
  tokenA: string;
  tokenB: string;
  decA: number;
  decB: number;
  fee: number;
}

/**
 * Compute spacing-aligned `tickLower`/`tickUpper` for an explicit price range,
 * sorted to the on-chain token0<token1 order. When Token A sorts as token1 the
 * price is inverted and the bounds swapped (so the result is always increasing).
 */
export function computeExplicitTicks(input: ExplicitTicksInput): {
  tickLower: number;
  tickUpper: number;
} {
  const { minPrice, maxPrice, tokenA, tokenB, decA, decB, fee } = input;
  const spacing = feeToSpacing(fee);
  const aIsToken0 = tokenA.toLowerCase() < tokenB.toLowerCase();

  let lowerTick: number;
  let upperTick: number;
  if (aIsToken0) {
    // token0 = A, token1 = B; price is already token1 per token0.
    lowerTick = priceToTick(minPrice, decA, decB);
    upperTick = priceToTick(maxPrice, decA, decB);
  } else {
    // token0 = B, token1 = A; invert price (token1/token0 = 1/userPrice) and
    // swap bounds so the ticks stay increasing.
    lowerTick = priceToTick(1 / maxPrice, decB, decA);
    upperTick = priceToTick(1 / minPrice, decB, decA);
  }

  return {
    tickLower: roundTickDown(lowerTick, spacing),
    tickUpper: roundTickUp(upperTick, spacing),
  };
}
