import {
  MAX_UINT256,
  RAY,
  base8ToUsd,
  healthFactorToNumber,
  rayRateToApy,
  tokenUsd,
} from './aave-math';

describe('AaveMath (hard fixtures — catches 10ⁿ scaling errors)', () => {
  describe('rayRateToApy', () => {
    it('compounds a 5% RAY APR to ~5.127% APY', () => {
      const fivePctRay = (5n * RAY) / 100n; // 0.05 * 1e27
      expect(rayRateToApy(fivePctRay)).toBeCloseTo(0.05127, 4); // ≈ e^0.05 - 1
    });

    it('returns 0 for a zero rate', () => {
      expect(rayRateToApy(0n)).toBe(0);
    });
  });

  describe('base8ToUsd', () => {
    it('treats the base value as 8-decimal USD', () => {
      expect(base8ToUsd(100_0000_0000n)).toBe(100); // 100 * 1e8
      expect(base8ToUsd(1_2345_6789n)).toBeCloseTo(1.23456789, 8);
    });
  });

  describe('healthFactorToNumber', () => {
    it('scales 1e18 to a plain number', () => {
      expect(healthFactorToNumber(15n * 10n ** 17n)).toBeCloseTo(1.5, 9); // 1.5e18
    });

    it('returns null (∞) for the no-debt uint256.max sentinel', () => {
      expect(healthFactorToNumber(MAX_UINT256)).toBeNull();
    });
  });

  describe('tokenUsd', () => {
    it('converts base units × price at the token decimals', () => {
      expect(tokenUsd(10n ** 18n, 18, 2)).toBe(2); // 1 token @ $2
      expect(tokenUsd(5n * 10n ** 17n, 18, 600)).toBe(300); // 0.5 @ $600
    });
  });
});
