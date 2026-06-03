import { describe, it, expect } from 'vitest';
import {
  feeToSpacing,
  priceToTick,
  roundTickDown,
  roundTickUp,
  presetTickDelta,
  computeExplicitTicks,
} from '../ticks';

describe('feeToSpacing', () => {
  it('maps the four PCS tiers', () => {
    expect(feeToSpacing(100)).toBe(1);
    expect(feeToSpacing(500)).toBe(10);
    expect(feeToSpacing(2500)).toBe(50);
    expect(feeToSpacing(10000)).toBe(200);
  });
});

describe('priceToTick', () => {
  it('price 1 (equal decimals) → tick 0', () => {
    expect(Math.round(priceToTick(1, 18, 18))).toBe(0);
  });

  it('matches the log_1.0001 formula for a known price', () => {
    // 1.0001^1000 ≈ 1.10517 ⇒ priceToTick(1.10517,18,18) ≈ 1000.
    expect(Math.round(priceToTick(1.10517, 18, 18))).toBe(1000);
  });

  it('applies the decimal adjustment (dec1 − dec0)', () => {
    // price 1 with dec0=18, dec1=6 ⇒ adjusted 10^-12 ⇒ large negative tick.
    expect(priceToTick(1, 18, 6)).toBeLessThan(-100000);
  });
});

describe('rounding (outward)', () => {
  it('rounds down to spacing (incl. negatives)', () => {
    expect(roundTickDown(55, 10)).toBe(50);
    expect(roundTickDown(-55, 10)).toBe(-60);
  });
  it('rounds up to spacing (incl. negatives)', () => {
    expect(roundTickUp(155, 10)).toBe(160);
    expect(roundTickUp(-155, 10)).toBe(-150);
  });
});

describe('presetTickDelta', () => {
  it('±10% ≈ 953 ticks', () => {
    expect(presetTickDelta(10)).toBe(953);
  });
  it('grows with the band width', () => {
    expect(presetTickDelta(20)).toBeGreaterThan(presetTickDelta(5));
  });
});

describe('computeExplicitTicks', () => {
  const A = '0x1111111111111111111111111111111111111111';
  const B = '0x2222222222222222222222222222222222222222'; // A < B ⇒ A = token0

  it('produces increasing, spacing-aligned ticks (A = token0)', () => {
    const { tickLower, tickUpper } = computeExplicitTicks({
      minPrice: 1.1,
      maxPrice: 1.3,
      tokenA: A,
      tokenB: B,
      decA: 18,
      decB: 18,
      fee: 500,
    });
    expect(tickLower).toBeLessThan(tickUpper);
    expect(tickLower % 10).toBe(0);
    expect(tickUpper % 10).toBe(0);
    // outward rounding: lower ≤ raw min tick, upper ≥ raw max tick
    expect(tickLower).toBeLessThanOrEqual(priceToTick(1.1, 18, 18));
    expect(tickUpper).toBeGreaterThanOrEqual(priceToTick(1.3, 18, 18));
  });

  it('inverts price + swaps bounds when Token A sorts as token1', () => {
    // Now A > B ⇒ token0 = B; the same prices should still give increasing ticks.
    const { tickLower, tickUpper } = computeExplicitTicks({
      minPrice: 1.1,
      maxPrice: 1.3,
      tokenA: B, // pass B as "A" but with a higher address as tokenA
      tokenB: A,
      decA: 18,
      decB: 18,
      fee: 500,
    });
    expect(tickLower).toBeLessThan(tickUpper);
  });
});
