import {
  downsample,
  isHistoryRange,
  rangeToCutoff,
} from './history';

describe('history pure helpers', () => {
  describe('isHistoryRange', () => {
    it('accepts the four valid ranges', () => {
      expect(isHistoryRange('24h')).toBe(true);
      expect(isHistoryRange('all')).toBe(true);
    });
    it('rejects anything else', () => {
      expect(isHistoryRange('1y')).toBe(false);
      expect(isHistoryRange('')).toBe(false);
    });
  });

  describe('rangeToCutoff', () => {
    const now = new Date('2026-06-06T12:00:00.000Z');
    it('returns null for "all" (no lower bound)', () => {
      expect(rangeToCutoff('all', now)).toBeNull();
    });
    it('subtracts the right window for 24h/7d/30d', () => {
      expect(rangeToCutoff('24h', now)!.toISOString()).toBe(
        '2026-06-05T12:00:00.000Z',
      );
      expect(rangeToCutoff('7d', now)!.toISOString()).toBe(
        '2026-05-30T12:00:00.000Z',
      );
      expect(rangeToCutoff('30d', now)!.toISOString()).toBe(
        '2026-05-07T12:00:00.000Z',
      );
    });
  });

  describe('downsample', () => {
    it('returns the series unchanged when within the limit', () => {
      const pts = [1, 2, 3];
      expect(downsample(pts, 200)).toBe(pts);
    });
    it('thins to exactly maxPoints, keeping first and last', () => {
      const pts = Array.from({ length: 1000 }, (_, i) => i);
      const out = downsample(pts, 100);
      expect(out).toHaveLength(100);
      expect(out[0]).toBe(0);
      expect(out[out.length - 1]).toBe(999);
    });
  });
});
