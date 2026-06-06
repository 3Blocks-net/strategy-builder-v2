/**
 * Pure performance/PnL math (Vault-Cockpit slice #06). No I/O.
 *
 * The PnL/earnings firewall (PRD Resolved decisions 3 & 9) is enforced here by
 * construction: these functions only ever see **boundary** VaultEvents — protocol
 * flows (ProtocolFlow) are never passed in, so they can't move net deposits.
 */

export interface BoundaryEvent {
  eventType: string; // 'DEPOSIT' | 'WITHDRAW'
  /** Write-time-frozen gross USD of the deposit/withdraw, or null (legacy). */
  amountUsd: number | null;
  feeBps: number;
}

/** Net deposited capital = Σ deposit USD − Σ withdraw USD (gross, frozen). */
export function netDepositsUsd(events: BoundaryEvent[]): number {
  return events.reduce((sum, e) => {
    if (e.amountUsd == null) return sum;
    if (e.eventType === 'DEPOSIT') return sum + e.amountUsd;
    if (e.eventType === 'WITHDRAW') return sum - e.amountUsd;
    return sum;
  }, 0);
}

/** Deposit/withdraw fees in USD = Σ amountUsd × feeBps / 10_000. */
export function feesUsd(events: BoundaryEvent[]): number {
  return events.reduce(
    (sum, e) => (e.amountUsd == null ? sum : sum + (e.amountUsd * e.feeBps) / 10_000),
    0,
  );
}

/**
 * PnL vs net deposits. `pnlPct` is null when net deposits ≤ 0 (avoids a
 * divide-by-zero / nonsensical % on a fresh or fully-withdrawn vault).
 */
export function computePnl(
  currentValueUsd: number,
  netDeposits: number,
): { pnlAbsUsd: number; pnlPct: number | null } {
  const pnlAbsUsd = currentValueUsd - netDeposits;
  const pnlPct = netDeposits > 0 ? pnlAbsUsd / netDeposits : null;
  return { pnlAbsUsd, pnlPct };
}
