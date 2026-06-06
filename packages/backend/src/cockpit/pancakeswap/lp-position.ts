/**
 * Pure builder: a raw PancakeSwap V3 LP read → a protocol-agnostic
 * ValuedPosition (PRD: Modules → PancakeV3Adapter). Kept separate from the I/O
 * adapter so the amount/in-range/USD/fees logic is unit-testable without a fork.
 */
import { ValuedPosition } from '../protocol-adapter';
import { getAmountsForLiquidity, getSqrtRatioAtTick } from './lp-math';

function tokenUsd(amount: bigint, decimals: number, price: number): number {
  return (Number(amount) / 10 ** decimals) * price;
}

/** One LP position read (NPM.positions + pool.slot0 + collect static-call). */
export interface LpRawRead {
  tokenId: bigint;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  currentTick: number;
  decimals0: number;
  symbol0: string;
  decimals1: number;
  symbol1: string;
  /** Live uncollected fees from the `collect` static-call (NOT `tokensOwed`). */
  uncollected0: bigint;
  uncollected1: bigint;
  price0: number | null;
  price1: number | null;
}

const sum = (a: number | null, b: number | null): number | null =>
  a == null && b == null ? null : (a ?? 0) + (b ?? 0);

export function buildLpPosition(r: LpRawRead): ValuedPosition {
  const sqrtLower = getSqrtRatioAtTick(r.tickLower);
  const sqrtUpper = getSqrtRatioAtTick(r.tickUpper);
  const { amount0, amount1 } = getAmountsForLiquidity(
    r.sqrtPriceX96,
    sqrtLower,
    sqrtUpper,
    r.liquidity,
  );

  const inRange = r.tickLower <= r.currentTick && r.currentTick < r.tickUpper;

  // Position value = principal + uncollected fees (both legs).
  const total0 = amount0 + r.uncollected0;
  const total1 = amount1 + r.uncollected1;
  const usd0 = r.price0 != null ? tokenUsd(total0, r.decimals0, r.price0) : null;
  const usd1 = r.price1 != null ? tokenUsd(total1, r.decimals1, r.price1) : null;

  const fee0Usd =
    r.price0 != null ? tokenUsd(r.uncollected0, r.decimals0, r.price0) : null;
  const fee1Usd =
    r.price1 != null ? tokenUsd(r.uncollected1, r.decimals1, r.price1) : null;
  const earningsUsd = sum(fee0Usd, fee1Usd);

  return {
    protocol: 'pancakeswap-v3',
    kind: 'lp',
    label: `${r.symbol0}/${r.symbol1} #${r.tokenId}`,
    legs: [
      {
        token: r.token0,
        symbol: r.symbol0,
        decimals: r.decimals0,
        amount: amount0.toString(),
        amountUsd: r.price0 != null ? tokenUsd(amount0, r.decimals0, r.price0) : null,
      },
      {
        token: r.token1,
        symbol: r.symbol1,
        decimals: r.decimals1,
        amount: amount1.toString(),
        amountUsd: r.price1 != null ? tokenUsd(amount1, r.decimals1, r.price1) : null,
      },
    ],
    valueUsd: sum(usd0, usd1),
    earningsUsd,
    metrics: {
      inRange,
      feeTier: r.fee,
      tickLower: r.tickLower,
      tickUpper: r.tickUpper,
      uncollectedFees0: r.uncollected0.toString(),
      uncollectedFees1: r.uncollected1.toString(),
      uncollectedUsd: earningsUsd,
    },
  };
}
