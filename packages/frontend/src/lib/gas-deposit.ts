export interface GasDepositAutomation {
  ownerOnly: boolean;
  active: boolean | null;
  isDraft: boolean;
}

/**
 * Decide whether to warn about an insufficient gas-compensation reserve.
 *
 * The reserve only matters for public automations run by external executors —
 * owner-executed and owner-only automations pay no compensation. So we warn only
 * when there is at least one active, deployed (non-draft) public automation AND
 * the deposit is empty or below the vault's minFeeDeposit target.
 */
export function shouldWarnGasDeposit(
  deposited: bigint,
  minFeeDeposit: bigint,
  automations: GasDepositAutomation[],
): boolean {
  const hasActivePublic = automations.some(
    (a) => !a.ownerOnly && a.active === true && !a.isDraft,
  );
  const tooLow = deposited === 0n || deposited < minFeeDeposit;
  return hasActivePublic && tooLow;
}
