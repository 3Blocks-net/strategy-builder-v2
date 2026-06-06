import {
  BoundaryEvent,
  computePnl,
  computeRangePnl,
  feesUsd,
  netDepositsUsd,
} from './performance';

const ev = (
  eventType: string,
  amountUsd: number | null,
  feeBps = 0,
): BoundaryEvent => ({ eventType, amountUsd, feeBps });

describe('performance pure math', () => {
  describe('netDepositsUsd', () => {
    it('sums deposits minus withdrawals', () => {
      expect(
        netDepositsUsd([ev('DEPOSIT', 100), ev('DEPOSIT', 50), ev('WITHDRAW', 30)]),
      ).toBe(120);
    });
    it('skips legacy events with no frozen USD', () => {
      expect(netDepositsUsd([ev('DEPOSIT', 100), ev('DEPOSIT', null)])).toBe(100);
    });
  });

  describe('feesUsd', () => {
    it('applies feeBps to the gross amount', () => {
      // 100 * 50bps = 0.5 ; 30 * 50bps = 0.15
      expect(feesUsd([ev('DEPOSIT', 100, 50), ev('WITHDRAW', 30, 50)])).toBeCloseTo(
        0.65,
      );
    });
  });

  describe('computePnl', () => {
    it('computes absolute + percentage PnL', () => {
      expect(computePnl(120, 100)).toEqual({ pnlAbsUsd: 20, pnlPct: 0.2 });
    });
    it('returns null pct (not ∞/NaN) when net deposits ≤ 0', () => {
      expect(computePnl(0, 0)).toEqual({ pnlAbsUsd: 0, pnlPct: null });
      expect(computePnl(5, -10).pnlPct).toBeNull();
    });
  });

  describe('computeRangePnl (flow-adjusted)', () => {
    it('a deposit made inside the window does NOT count as profit', () => {
      // started at $100, deposited $50 mid-window, now $150 → pure value growth 0
      const { pnlAbsUsd } = computeRangePnl(150, 100, 50);
      expect(pnlAbsUsd).toBe(0);
    });

    it('measures growth above the baseline + injected capital', () => {
      // baseline $100, +$50 deposited, now $165 → $15 strategy gain
      const { pnlAbsUsd, pnlPct } = computeRangePnl(165, 100, 50);
      expect(pnlAbsUsd).toBe(15);
      expect(pnlPct).toBeCloseTo(15 / 150); // capital at risk = 150
    });

    it('reduces to all-time PnL when the baseline is 0', () => {
      expect(computeRangePnl(120, 0, 100)).toEqual(computePnl(120, 100));
    });

    it('null pct when no capital was at risk', () => {
      expect(computeRangePnl(10, 0, 0).pnlPct).toBeNull();
    });
  });
});
