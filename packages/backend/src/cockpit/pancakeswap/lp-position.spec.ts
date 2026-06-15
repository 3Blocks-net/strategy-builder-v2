import { buildLpPosition, LpRawRead } from './lp-position';
import { getSqrtRatioAtTick } from './lp-math';

const base = (over: Partial<LpRawRead> = {}): LpRawRead => ({
  tokenId: 42n,
  token0: '0xUSDT',
  token1: '0xWBNB',
  fee: 500,
  tickLower: -60,
  tickUpper: 60,
  liquidity: 10n ** 18n,
  sqrtPriceX96: getSqrtRatioAtTick(0), // tick 0, in range
  currentTick: 0,
  decimals0: 18,
  symbol0: 'USDT',
  decimals1: 18,
  symbol1: 'WBNB',
  uncollected0: 0n,
  uncollected1: 0n,
  price0: 1,
  price1: 600,
  ...over,
});

describe('buildLpPosition', () => {
  it('marks a position in range when tickLower ≤ tick < tickUpper', () => {
    const p = buildLpPosition(base({ currentTick: 0 }));
    expect(p.metrics?.inRange).toBe(true);
    expect(p.kind).toBe('lp');
    expect(p.legs).toHaveLength(2);
  });

  it('marks a position out of range above the upper tick', () => {
    const p = buildLpPosition(
      base({ currentTick: 120, sqrtPriceX96: getSqrtRatioAtTick(120) }),
    );
    expect(p.metrics?.inRange).toBe(false);
  });

  it('treats the upper tick as exclusive (tick == tickUpper is out of range)', () => {
    const p = buildLpPosition(base({ currentTick: 60 }));
    expect(p.metrics?.inRange).toBe(false);
  });

  it('counts uncollected fees as earnings and into value', () => {
    const p = buildLpPosition(
      base({
        uncollected0: 5n * 10n ** 18n, // 5 USDT
        uncollected1: 1n * 10n ** 16n, // 0.01 WBNB
      }),
    );
    // earnings = 5*$1 + 0.01*$600 = $11
    expect(p.earningsUsd).toBeCloseTo(11);
    expect(p.metrics?.feeTier).toBe(500);
  });

  it('degrades value to null when both prices are missing', () => {
    const p = buildLpPosition(base({ price0: null, price1: null }));
    expect(p.valueUsd).toBeNull();
    expect(p.earningsUsd).toBeNull();
  });

  it('still values the priced leg when only one price is missing', () => {
    const p = buildLpPosition(
      base({
        currentTick: -120, // below range → all token0 (USDT, priced)
        sqrtPriceX96: getSqrtRatioAtTick(-120),
        price1: null,
      }),
    );
    expect(p.valueUsd).not.toBeNull();
  });
});
