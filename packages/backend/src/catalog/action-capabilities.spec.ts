import { ACTION_CAPABILITIES, AmountMode } from './action-capabilities';

describe('ACTION_CAPABILITIES (source of truth, mirrors ActionLib.AmountMode)', () => {
  const aaveActions = [
    'AaveV3SupplyAction',
    'AaveV3WithdrawAction',
    'AaveV3BorrowAction',
    'AaveV3RepayAction',
  ];

  it.each(aaveActions)('%s supports all four amount modes', (key) => {
    const cap = ACTION_CAPABILITIES[key];
    expect(cap).toBeDefined();
    expect([...cap.supportedModes].sort()).toEqual([
      AmountMode.FIXED,
      AmountMode.FROM_SLOT,
      AmountMode.MAX_AVAILABLE,
      AmountMode.TARGET_HF,
    ]);
  });

  it.each(aaveActions)('%s requires a health-factor field for TARGET_HF', (key) => {
    const req = ACTION_CAPABILITIES[key].modeFields?.find((m) => m.mode === AmountMode.TARGET_HF);
    expect(req?.widget).toBe('health-factor');
  });
});
