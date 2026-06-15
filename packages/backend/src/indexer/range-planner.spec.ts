import { RangePlanner } from './range-planner';

describe('RangePlanner', () => {
  describe('plan', () => {
    it('applies the head - confirmations cap', () => {
      // head 100, confirmations 5 => safe head 95; cursor 90 => scan 91..95
      expect(RangePlanner.plan(100, 90, 2000, 5)).toEqual([
        { from: 91, to: 95 },
      ]);
    });

    it('returns nothing when the only new blocks are inside the confirmation window', () => {
      // head 100, confirmations 5 => safe head 95; cursor already at 95
      expect(RangePlanner.plan(100, 95, 2000, 5)).toEqual([]);
      // cursor ahead of safe head (shallow chain)
      expect(RangePlanner.plan(100, 96, 2000, 5)).toEqual([]);
    });

    it('chunks a wide gap into windows of at most maxRange blocks (inclusive)', () => {
      // safe head 1000, cursor 0, maxRange 400 => 1..400, 401..800, 801..1000
      expect(RangePlanner.plan(1000, 0, 400, 0)).toEqual([
        { from: 1, to: 400 },
        { from: 401, to: 800 },
        { from: 801, to: 1000 },
      ]);
    });

    it('emits a single window when the gap fits in maxRange', () => {
      expect(RangePlanner.plan(50, 9, 2000, 0)).toEqual([{ from: 10, to: 50 }]);
    });

    it('honours a maxRange of 1 (one window per block)', () => {
      expect(RangePlanner.plan(3, 0, 1, 0)).toEqual([
        { from: 1, to: 1 },
        { from: 2, to: 2 },
        { from: 3, to: 3 },
      ]);
    });

    it('rejects invalid inputs', () => {
      expect(() => RangePlanner.plan(100, 0, 0, 5)).toThrow();
      expect(() => RangePlanner.plan(100, 0, 2000, -1)).toThrow();
    });
  });

  describe('halve', () => {
    it('splits a multi-block range into two contiguous, non-overlapping halves', () => {
      expect(RangePlanner.halve({ from: 1, to: 100 })).toEqual([
        { from: 1, to: 50 },
        { from: 51, to: 100 },
      ]);
    });

    it('splits an odd range without gaps or overlaps', () => {
      const halves = RangePlanner.halve({ from: 1, to: 4 });
      expect(halves).toEqual([
        { from: 1, to: 2 },
        { from: 3, to: 4 },
      ]);
    });

    it('cannot narrow a single-block range (returns it unchanged)', () => {
      expect(RangePlanner.halve({ from: 7, to: 7 })).toEqual([
        { from: 7, to: 7 },
      ]);
    });

    it('repeated halving converges to single-block ranges that cover the original', () => {
      let work = [{ from: 1, to: 10 }];
      // simulate the indexer always halving the first window until all are atomic
      const atomic: { from: number; to: number }[] = [];
      let guard = 0;
      while (work.length && guard++ < 1000) {
        const next = work.shift()!;
        if (next.to === next.from) {
          atomic.push(next);
        } else {
          work.push(...RangePlanner.halve(next));
        }
      }
      atomic.sort((a, b) => a.from - b.from);
      expect(atomic.map((r) => r.from)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(atomic.every((r) => r.from === r.to)).toBe(true);
    });
  });
});
