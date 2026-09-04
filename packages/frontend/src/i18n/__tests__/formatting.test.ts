import { describe, expect, it } from 'vitest';
import { createFormatters } from '../formatting';

const en = createFormatters('en');
const de = createFormatters('de');

/** Non-breaking spaces are an Intl detail — compare on plain spaces. */
const plain = (value: string) => value.replace(/\s/g, ' ');

describe('formatters', () => {
  it('writes money in the notation of the chosen language', () => {
    expect(en.usd(1234.56)).toBe('$1,234.56');
    expect(plain(de.usd(1234.56))).toBe('1.234,56 $');
  });

  it('marks gains with a sign in both languages', () => {
    expect(en.signedUsd(12.5)).toBe('+$12.50');
    expect(plain(de.signedUsd(12.5))).toBe('+12,50 $');
    expect(en.signedUsd(-12.5)).toBe('-$12.50');
  });

  it('swaps decimal and thousands separators for plain numbers', () => {
    expect(en.number(1234.5678, { maximumFractionDigits: 4 })).toBe('1,234.5678');
    expect(de.number(1234.5678, { maximumFractionDigits: 4 })).toBe('1.234,5678');
  });

  it('turns a ratio into a percentage', () => {
    expect(en.percent(0.1234)).toBe('12.34%');
    expect(plain(de.percent(0.1234))).toBe('12,34 %');
  });

  it('writes dates in the chosen language', () => {
    const day = '2026-05-15T12:00:00Z';
    expect(en.date(day)).toContain('May');
    expect(de.date(day)).toContain('Mai');
  });

  it('carries its language so callers can key off it', () => {
    expect(de.language).toBe('de');
  });
});
