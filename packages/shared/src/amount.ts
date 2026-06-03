/**
 * Token-amount <-> base-units conversion (viem `parseUnits` semantics for
 * in-precision values). Pure, IO-free.
 *
 * `toBaseUnits('1.5', 18) → '1500000000000000000'`. The inverse `fromBaseUnits`
 * exists for round-trip tests; runtime never reverses base units back to a
 * human amount (no back-compat decompose). Over-precision (more fractional
 * digits than `decimals`) throws — the friendly validator catches it first, so
 * the mapper only ever sees in-precision values.
 */

const AMOUNT_RE = /^\d+(\.\d+)?$/;

export function toBaseUnits(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`decimals must be a non-negative integer, got: ${decimals}`);
  }
  const trimmed = String(value).trim();
  if (!AMOUNT_RE.test(trimmed)) {
    throw new Error(`Invalid token amount: ${value}`);
  }

  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > decimals) {
    throw new Error(
      `Token amount "${value}" has more than ${decimals} decimal places`,
    );
  }

  const paddedFrac = frac.padEnd(decimals, '0');
  const combined = `${whole}${paddedFrac}`.replace(/^0+/, '') || '0';
  return BigInt(combined).toString();
}

export function fromBaseUnits(base: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`decimals must be a non-negative integer, got: ${decimals}`);
  }
  const n = BigInt(base);
  if (decimals === 0) return n.toString();

  const digits = n.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}
