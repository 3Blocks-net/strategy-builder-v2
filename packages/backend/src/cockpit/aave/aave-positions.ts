/**
 * Pure builder: raw Aave reads → protocol-agnostic ValuedPositions (PRD:
 * Modules → AaveV3Adapter / Valuation rules). Kept separate from the I/O adapter
 * so the composition logic (debt subtraction, HF=∞, claimed-token exclusion) is
 * unit-testable without a fork.
 */
import { ValuedPosition } from '../protocol-adapter';
import {
  base8ToUsd,
  healthFactorToNumber,
  rayRateToApy,
  tokenUsd,
} from './aave-math';

/** Per-reserve on-chain read for a vault. */
export interface AaveReserveRead {
  asset: string;
  symbol: string;
  decimals: number;
  aToken: string;
  variableDebtToken: string;
  /** aToken.balanceOf(vault) in base units (rebasing, includes interest). */
  supplied: bigint;
  /** variableDebtToken.balanceOf(vault) in base units. */
  debt: bigint;
  /** Oracle price (already converted from 8-dec base to USD), or null. */
  priceUsd: number | null;
  supplyRateRay: bigint;
  borrowRateRay: bigint;
}

/** Aggregate account read (`Pool.getUserAccountData`). */
export interface AaveAccountRead {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  healthFactor: bigint;
}

/**
 * Build the vault's Aave positions + the set of tokens the adapter claims.
 *
 * - supply legs add to net equity; borrow legs subtract (negative `valueUsd`).
 * - `claimed` always includes every reserve's aToken + variableDebtToken
 *   (regardless of balance) so they can never appear in the idle list.
 * - a single summary row carries the aggregate health factor (∞ when no debt).
 */
export function buildAavePositions(
  reserves: AaveReserveRead[],
  account: AaveAccountRead,
  /** token (lowercased) → net principal USD (slice #08); undefined/null → no earnings. */
  netPrincipalByReserve?: Map<string, number | null>,
): { positions: ValuedPosition[]; claimed: string[] } {
  const positions: ValuedPosition[] = [];
  const claimed: string[] = [];

  for (const r of reserves) {
    claimed.push(r.aToken, r.variableDebtToken);

    if (r.supplied > 0n) {
      const usd =
        r.priceUsd != null ? tokenUsd(r.supplied, r.decimals, r.priceUsd) : null;
      const principal = netPrincipalByReserve?.get(r.asset.toLowerCase());
      const earningsUsd =
        usd != null && typeof principal === 'number' ? usd - principal : null;
      positions.push({
        protocol: 'aave-v3',
        kind: 'supply',
        label: `${r.symbol} supplied`,
        legs: [
          {
            token: r.asset,
            symbol: r.symbol,
            decimals: r.decimals,
            amount: r.supplied.toString(),
            amountUsd: usd,
          },
        ],
        valueUsd: usd,
        earningsUsd,
        metrics: { supplyApy: rayRateToApy(r.supplyRateRay) },
      });
    }

    if (r.debt > 0n) {
      const usd =
        r.priceUsd != null ? tokenUsd(r.debt, r.decimals, r.priceUsd) : null;
      positions.push({
        protocol: 'aave-v3',
        kind: 'borrow',
        label: `${r.symbol} borrowed`,
        legs: [
          {
            token: r.asset,
            symbol: r.symbol,
            decimals: r.decimals,
            amount: r.debt.toString(),
            amountUsd: usd,
            isDebt: true,
          },
        ],
        valueUsd: usd != null ? -usd : null,
        debtUsd: usd ?? undefined,
        metrics: { borrowApy: rayRateToApy(r.borrowRateRay) },
      });
    }
  }

  if (account.totalCollateralBase > 0n || account.totalDebtBase > 0n) {
    positions.push({
      protocol: 'aave-v3',
      kind: 'summary',
      label: 'Account health',
      legs: [],
      valueUsd: null,
      metrics: {
        healthFactor: healthFactorToNumber(account.healthFactor),
        collateralUsd: base8ToUsd(account.totalCollateralBase),
        debtUsd: base8ToUsd(account.totalDebtBase),
      },
    });
  }

  return { positions, claimed };
}
