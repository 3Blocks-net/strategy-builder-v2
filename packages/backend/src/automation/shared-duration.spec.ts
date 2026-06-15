import { toSeconds, fromSeconds } from 'shared';

/**
 * Toolchain tracer: proves the built `shared` CJS package resolves and runs
 * under the backend's ts-jest (CommonJS) toolchain. If this import fails, the
 * `shared` build step (pnpm topology prerequisite) was skipped.
 */
describe('shared package (backend / ts-jest CJS consumption)', () => {
  it('converts durations to seconds', () => {
    expect(toSeconds({ value: 7, unit: 'days' })).toBe(604800);
    expect(toSeconds({ value: 90, unit: 'minutes' })).toBe(5400);
  });

  it('round-trips through fromSeconds', () => {
    expect(fromSeconds(604800, 'days')).toEqual({ value: 7, unit: 'days' });
  });
});
