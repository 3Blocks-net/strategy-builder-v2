/**
 * Timestamp encoding for `contextOverrides` — pure, IO-free.
 *
 * Encodes a Unix-seconds timestamp as a 32-byte ABI `uint256` hex string
 * (`0x` + 64 hex chars), identical to `AbiCoder.encode(['uint256'], [n])`.
 * Used to write a time-based trigger's chosen start time as the initial value
 * of its auto-assigned context slot in the deploy `setContext` transaction.
 */

const UINT256_HEX_DIGITS = 64;

export function encodeTimestamp(unixSeconds: number): string {
  if (
    typeof unixSeconds !== 'number' ||
    !Number.isFinite(unixSeconds) ||
    !Number.isInteger(unixSeconds)
  ) {
    throw new Error(`Timestamp must be an integer number of seconds, got: ${String(unixSeconds)}`);
  }
  if (unixSeconds < 0) {
    throw new Error(`Timestamp must be non-negative, got: ${unixSeconds}`);
  }
  return '0x' + BigInt(unixSeconds).toString(16).padStart(UINT256_HEX_DIGITS, '0');
}
