import { describe, it, expect } from 'vitest';
import { toSeconds, fromSeconds } from '../duration';

/**
 * Toolchain tracer: proves the built `shared` CJS package resolves and runs
 * under the frontend's Vite/Vitest (ESM) toolchain via the re-export module.
 */
describe('shared package (frontend / Vite ESM consumption)', () => {
  it('converts durations to seconds', () => {
    expect(toSeconds({ value: 7, unit: 'days' })).toBe(604800);
    expect(toSeconds({ value: 90, unit: 'minutes' })).toBe(5400);
  });

  it('round-trips through fromSeconds', () => {
    expect(fromSeconds(604800, 'days')).toEqual({ value: 7, unit: 'days' });
  });
});
