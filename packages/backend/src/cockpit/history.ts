/**
 * Pure value-history helpers (Vault-Cockpit slice #05). No I/O — range→cutoff and
 * downsampling are unit-testable in isolation.
 */

export const VALID_RANGES = ['24h', '7d', '30d', 'all'] as const;
export type HistoryRange = (typeof VALID_RANGES)[number];

/** Max points returned per range so a chart never gets thousands of points. */
export const MAX_HISTORY_POINTS = 200;

const RANGE_MS: Record<Exclude<HistoryRange, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function isHistoryRange(value: string): value is HistoryRange {
  return (VALID_RANGES as readonly string[]).includes(value);
}

/** Lower time bound for a range, or null for 'all' (no bound). */
export function rangeToCutoff(range: HistoryRange, now: Date): Date | null {
  if (range === 'all') return null;
  return new Date(now.getTime() - RANGE_MS[range]);
}

/**
 * Evenly thin a series to at most `maxPoints`, always keeping the first and last
 * point so the curve's endpoints are exact.
 */
export function downsample<T>(points: T[], maxPoints: number): T[] {
  const n = points.length;
  if (maxPoints < 2 || n <= maxPoints) return points;
  const out: T[] = [];
  const step = (n - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}
