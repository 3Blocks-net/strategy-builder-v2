import { describe, it, expect } from 'vitest';
import { shouldWarnGasDeposit, type GasDepositAutomation } from '../gas-deposit';

const publicActive: GasDepositAutomation = { ownerOnly: false, active: true, isDraft: false };
const ownerActive: GasDepositAutomation = { ownerOnly: true, active: true, isDraft: false };
const publicInactive: GasDepositAutomation = { ownerOnly: false, active: false, isDraft: false };
const publicDraft: GasDepositAutomation = { ownerOnly: false, active: null, isDraft: true };

describe('shouldWarnGasDeposit', () => {
  it('warns when an active public automation exists and the deposit is empty', () => {
    expect(shouldWarnGasDeposit(0n, 0n, [publicActive])).toBe(true);
  });

  it('warns when the deposit is below the minFeeDeposit target', () => {
    expect(shouldWarnGasDeposit(1n, 2n, [publicActive])).toBe(true);
  });

  it('does not warn when the deposit meets the target', () => {
    expect(shouldWarnGasDeposit(2n, 2n, [publicActive])).toBe(false);
  });

  it('does not warn without an active public automation (owner-only only)', () => {
    expect(shouldWarnGasDeposit(0n, 0n, [ownerActive])).toBe(false);
  });

  it('ignores inactive and draft public automations', () => {
    expect(shouldWarnGasDeposit(0n, 0n, [publicInactive, publicDraft])).toBe(false);
  });

  it('does not warn when there are no automations at all', () => {
    expect(shouldWarnGasDeposit(0n, 0n, [])).toBe(false);
  });
});
