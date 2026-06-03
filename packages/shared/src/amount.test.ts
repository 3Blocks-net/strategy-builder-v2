import { describe, it, expect } from 'vitest';
import { toBaseUnits, fromBaseUnits } from './amount';

describe('toBaseUnits', () => {
  it('converts with 18 decimals', () => {
    expect(toBaseUnits('1.5', 18)).toBe('1500000000000000000');
    expect(toBaseUnits('1', 18)).toBe('1000000000000000000');
    expect(toBaseUnits('0', 18)).toBe('0');
  });

  it('converts with non-18 decimals', () => {
    expect(toBaseUnits('1.5', 6)).toBe('1500000');
    expect(toBaseUnits('2.5', 8)).toBe('250000000');
    expect(toBaseUnits('10', 0)).toBe('10');
  });

  it('handles fractional with fewer digits than decimals', () => {
    expect(toBaseUnits('0.000001', 18)).toBe('1000000000000');
    expect(toBaseUnits('1.05', 6)).toBe('1050000');
  });

  it('throws on over-precision (more decimals than the token allows)', () => {
    expect(() => toBaseUnits('1.1234567', 6)).toThrow(/decimal places/);
    expect(() => toBaseUnits('0.5', 0)).toThrow(/decimal places/);
  });

  it('throws on a non-numeric amount', () => {
    expect(() => toBaseUnits('abc', 18)).toThrow();
    expect(() => toBaseUnits('1.5.0', 18)).toThrow();
    expect(() => toBaseUnits('-1', 18)).toThrow();
  });
});

describe('fromBaseUnits', () => {
  it('inverts toBaseUnits', () => {
    expect(fromBaseUnits('1500000000000000000', 18)).toBe('1.5');
    expect(fromBaseUnits('1500000', 6)).toBe('1.5');
    expect(fromBaseUnits('1000000000000000000', 18)).toBe('1');
    expect(fromBaseUnits('0', 18)).toBe('0');
    expect(fromBaseUnits('10', 0)).toBe('10');
  });
});

describe('round-trip', () => {
  const cases: [string, number][] = [
    ['1.5', 18],
    ['1.5', 6],
    ['0.000001', 18],
    ['1234.5678', 8],
    ['0', 18],
    ['1000000', 6],
  ];
  for (const [value, decimals] of cases) {
    it(`round-trips ${value} @ ${decimals} decimals`, () => {
      expect(fromBaseUnits(toBaseUnits(value, decimals), decimals)).toBe(value);
    });
  }
});
