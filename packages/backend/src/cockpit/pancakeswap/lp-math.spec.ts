import {
  MAX_TICK,
  MIN_TICK,
  Q96,
  depositSwapFraction,
  getAmountsForLiquidity,
  getSqrtRatioAtTick,
} from './lp-math';

describe('LpMath (hard fixtures — catches Q96/Q128 scaling errors)', () => {
  describe('getSqrtRatioAtTick — canonical TickMath anchors', () => {
    it('tick 0 → exactly 2^96', () => {
      expect(getSqrtRatioAtTick(0)).toBe(Q96);
      expect(getSqrtRatioAtTick(0)).toBe(79228162514264337593543950336n);
    });

    it('MIN_TICK → MIN_SQRT_RATIO (4295128739)', () => {
      expect(getSqrtRatioAtTick(MIN_TICK)).toBe(4295128739n);
    });

    it('MAX_TICK → MAX_SQRT_RATIO', () => {
      expect(getSqrtRatioAtTick(MAX_TICK)).toBe(
        1461446703485210103287273052203988822378723970342n,
      );
    });

    it('is monotonic and symmetric-ish around 0', () => {
      expect(getSqrtRatioAtTick(60)).toBeGreaterThan(getSqrtRatioAtTick(0));
      expect(getSqrtRatioAtTick(-60)).toBeLessThan(getSqrtRatioAtTick(0));
    });

    it('rejects out-of-range ticks', () => {
      expect(() => getSqrtRatioAtTick(MAX_TICK + 1)).toThrow();
    });
  });

  describe('getAmountsForLiquidity — exact integer fixtures', () => {
    const a = Q96; // lower sqrt ratio
    const b = 2n * Q96; // upper sqrt ratio
    const L = Q96;

    it('price below range → all token0', () => {
      const { amount0, amount1 } = getAmountsForLiquidity(Q96 / 2n, a, b, L);
      expect(amount0).toBe(2n ** 95n);
      expect(amount1).toBe(0n);
    });

    it('price above range → all token1', () => {
      const { amount0, amount1 } = getAmountsForLiquidity(4n * Q96, a, b, L);
      expect(amount0).toBe(0n);
      expect(amount1).toBe(Q96); // 2^96
    });

    it('price in range → both legs positive', () => {
      const { amount0, amount1 } = getAmountsForLiquidity(
        (3n * Q96) / 2n,
        a,
        b,
        L,
      );
      expect(amount0).toBeGreaterThan(0n);
      expect(amount1).toBeGreaterThan(0n);
    });

    it('is order-insensitive in the range bounds', () => {
      const x = getAmountsForLiquidity(Q96 / 2n, a, b, L);
      const y = getAmountsForLiquidity(Q96 / 2n, b, a, L);
      expect(y).toEqual(x);
    });
  });

  describe('depositSwapFraction (single-sided entry sizing)', () => {
    it('symmetric range at the centre → ~50% swap (either deposit token)', () => {
      expect(depositSwapFraction(0, -1000, 1000, true)).toBeCloseTo(0.5, 2);
      expect(depositSwapFraction(0, -1000, 1000, false)).toBeCloseTo(0.5, 2);
    });

    it('price below the range → position is all token0', () => {
      // deposit token0 ⇒ nothing to swap; deposit token1 ⇒ swap everything to token0.
      expect(depositSwapFraction(-2000, -1000, 1000, true)).toBe(0);
      expect(depositSwapFraction(-2000, -1000, 1000, false)).toBe(1);
    });

    it('price above the range → position is all token1', () => {
      expect(depositSwapFraction(2000, -1000, 1000, true)).toBe(1);
      expect(depositSwapFraction(2000, -1000, 1000, false)).toBe(0);
    });

    it('skewed range (price near the lower bound) → mostly token0, swap little', () => {
      // current price close to the lower tick ⇒ the position needs mostly token0,
      // so a token0 deposit swaps only a small fraction.
      const f = depositSwapFraction(-900, -1000, 1000, true);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(0.5);
    });

    it('rejects an inverted range', () => {
      expect(() => depositSwapFraction(0, 1000, -1000, true)).toThrow();
    });
  });
});
