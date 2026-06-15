import { describe, it, expect } from 'vitest';
import { encodeTimestamp } from './timestamp';

describe('encodeTimestamp', () => {
  it('encodes 0 as 32 zero bytes', () => {
    expect(encodeTimestamp(0)).toBe('0x' + '0'.repeat(64));
  });

  it('encodes small values right-aligned (big-endian)', () => {
    expect(encodeTimestamp(255)).toBe('0x' + '0'.repeat(62) + 'ff');
    expect(encodeTimestamp(256)).toBe('0x' + '0'.repeat(60) + '0100');
  });

  it('produces a 0x + 64-hex-char string (32 bytes)', () => {
    const hex = encodeTimestamp(86400);
    expect(hex.startsWith('0x')).toBe(true);
    expect(hex.length).toBe(66);
    expect(hex.slice(2)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches AbiCoder uint256 encoding semantics (round-trips via BigInt)', () => {
    const n = 1_234_567_890;
    expect(BigInt(encodeTimestamp(n))).toBe(BigInt(n));
  });

  it('rejects negative, non-integer, and non-finite inputs', () => {
    expect(() => encodeTimestamp(-1)).toThrow();
    expect(() => encodeTimestamp(1.5)).toThrow();
    expect(() => encodeTimestamp(NaN)).toThrow();
    expect(() => encodeTimestamp(Infinity)).toThrow();
  });
});
