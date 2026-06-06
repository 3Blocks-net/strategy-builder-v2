/**
 * Pure Aave V3 math (PRD: Modules → AaveMath). No I/O, no ethers — so a 10ⁿ
 * scaling error is caught by hard-fixture unit tests, not a fork run.
 *
 * Aave conventions on BSC:
 * - Interest rates (`currentLiquidityRate` / `currentVariableBorrowRate`) are
 *   **RAY (1e27)** annual APRs → compound per-second to an APY.
 * - Account base values (`getUserAccountData`) are **USD with 8 decimals**.
 * - `healthFactor` is **1e18-scaled**; `type(uint256).max` means "no debt" → ∞.
 */

export const RAY = 10n ** 27n;
export const SECONDS_PER_YEAR = 31_536_000;
export const MAX_UINT256 = 2n ** 256n - 1n;

/** RAY annual APR → per-second-compounded APY (fraction, e.g. 0.05 = 5%). */
export function rayRateToApy(rateRay: bigint): number {
  const apr = Number(rateRay) / Number(RAY);
  return (1 + apr / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;
}

/** Aave 8-decimal USD base value → a plain USD number. */
export function base8ToUsd(base8: bigint): number {
  return Number(base8) / 1e8;
}

/** 1e18 health factor → number, or null for the `uint256.max` (no-debt → ∞) case. */
export function healthFactorToNumber(hf: bigint): number | null {
  if (hf >= MAX_UINT256) return null;
  return Number(hf) / 1e18;
}

/** Token base-unit amount × USD price → USD value. */
export function tokenUsd(
  amount: bigint,
  decimals: number,
  priceUsd: number,
): number {
  return (Number(amount) / 10 ** decimals) * priceUsd;
}
