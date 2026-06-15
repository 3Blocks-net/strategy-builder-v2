import { describe, it, expect } from 'vitest';
import { toSeconds, fromSeconds, type DurationUnit } from './duration';

describe('toSeconds', () => {
  it('converts all four units at value 1', () => {
    expect(toSeconds({ value: 1, unit: 'minutes' })).toBe(60);
    expect(toSeconds({ value: 1, unit: 'hours' })).toBe(3600);
    expect(toSeconds({ value: 1, unit: 'days' })).toBe(86400);
    expect(toSeconds({ value: 1, unit: 'weeks' })).toBe(604800);
  });

  it('converts the acceptance-criteria examples', () => {
    expect(toSeconds({ value: 90, unit: 'minutes' })).toBe(5400);
    expect(toSeconds({ value: 7, unit: 'days' })).toBe(604800);
  });

  it('handles non-round and boundary values', () => {
    expect(toSeconds({ value: 0, unit: 'days' })).toBe(0);
    expect(toSeconds({ value: 2.5, unit: 'hours' })).toBe(9000);
    expect(toSeconds({ value: 1.5, unit: 'minutes' })).toBe(90);
  });

  it('throws on a non-finite value', () => {
    expect(() => toSeconds({ value: NaN, unit: 'days' })).toThrow();
    expect(() => toSeconds({ value: Infinity, unit: 'days' })).toThrow();
  });

  it('throws on an unknown unit', () => {
    expect(() => toSeconds({ value: 1, unit: 'months' as DurationUnit })).toThrow();
  });
});

describe('fromSeconds', () => {
  it('inverts toSeconds for whole values', () => {
    expect(fromSeconds(604800, 'days')).toEqual({ value: 7, unit: 'days' });
    expect(fromSeconds(5400, 'minutes')).toEqual({ value: 90, unit: 'minutes' });
  });
});

describe('round-trip', () => {
  const units: DurationUnit[] = ['minutes', 'hours', 'days', 'weeks'];
  const values = [0, 1, 7, 30, 90, 2.5];

  for (const unit of units) {
    for (const value of values) {
      it(`round-trips ${value} ${unit}`, () => {
        const seconds = toSeconds({ value, unit });
        expect(fromSeconds(seconds, unit)).toEqual({ value, unit });
      });
    }
  }
});
