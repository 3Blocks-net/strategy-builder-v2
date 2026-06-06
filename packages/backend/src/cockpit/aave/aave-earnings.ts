/**
 * Pure Aave earnings helper (Vault-Cockpit slice #08).
 *
 * Net principal per reserve = Σ supplied USD − Σ withdrawn USD, from the
 * adapter-indexed `ProtocolFlow` rows. Earnings = current supplied USD − net
 * principal (the current supplied value already = scaledBalance × liquidityIndex,
 * i.e. aToken.balanceOf). A reserve with any USD-less flow yields `null` (can't
 * be computed exactly) rather than a wrong number.
 */
export interface AaveFlow {
  token: string;
  kind: string; // AAVE_SUPPLY | AAVE_WITHDRAW
  amountUsd: number | null;
}

/** token (lowercased) → net principal USD, or null when not exactly computable. */
export function netPrincipalByReserve(
  flows: AaveFlow[],
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const f of flows) {
    const key = f.token.toLowerCase();
    if (out.get(key) === null) continue; // already poisoned

    if (f.amountUsd == null) {
      out.set(key, null);
      continue;
    }
    const prev = out.get(key);
    const base = typeof prev === 'number' ? prev : 0;
    const delta =
      f.kind === 'AAVE_SUPPLY'
        ? f.amountUsd
        : f.kind === 'AAVE_WITHDRAW'
          ? -f.amountUsd
          : 0;
    out.set(key, base + delta);
  }
  return out;
}
