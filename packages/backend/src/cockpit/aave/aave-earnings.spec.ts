import { netPrincipalByReserve } from './aave-earnings';

describe('netPrincipalByReserve', () => {
  it('nets supplies minus withdrawals per reserve', () => {
    const m = netPrincipalByReserve([
      { token: '0xA', kind: 'AAVE_SUPPLY', amountUsd: 100 },
      { token: '0xA', kind: 'AAVE_SUPPLY', amountUsd: 50 },
      { token: '0xA', kind: 'AAVE_WITHDRAW', amountUsd: 30 },
    ]);
    expect(m.get('0xa')).toBe(120);
  });

  it('keys are case-insensitive', () => {
    const m = netPrincipalByReserve([
      { token: '0xAbC', kind: 'AAVE_SUPPLY', amountUsd: 10 },
      { token: '0xabc', kind: 'AAVE_SUPPLY', amountUsd: 5 },
    ]);
    expect(m.get('0xabc')).toBe(15);
  });

  it('poisons a reserve to null if any flow lacks frozen USD (cannot be exact)', () => {
    const m = netPrincipalByReserve([
      { token: '0xA', kind: 'AAVE_SUPPLY', amountUsd: 100 },
      { token: '0xA', kind: 'AAVE_SUPPLY', amountUsd: null },
    ]);
    expect(m.get('0xa')).toBeNull();
  });
});
