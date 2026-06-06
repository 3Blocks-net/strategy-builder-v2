import { MAX_UINT256, RAY } from './aave-math';
import {
  AaveAccountRead,
  AaveReserveRead,
  buildAavePositions,
} from './aave-positions';

const reserve = (over: Partial<AaveReserveRead> = {}): AaveReserveRead => ({
  asset: '0xUSDT',
  symbol: 'USDT',
  decimals: 18,
  aToken: '0xaUSDT',
  variableDebtToken: '0xdUSDT',
  supplied: 0n,
  debt: 0n,
  priceUsd: 1,
  supplyRateRay: (3n * RAY) / 100n,
  borrowRateRay: (6n * RAY) / 100n,
  ...over,
});

const account = (over: Partial<AaveAccountRead> = {}): AaveAccountRead => ({
  totalCollateralBase: 0n,
  totalDebtBase: 0n,
  healthFactor: MAX_UINT256,
  ...over,
});

describe('buildAavePositions', () => {
  it('always claims aToken + variableDebtToken even with zero balance', () => {
    const { claimed } = buildAavePositions([reserve()], account());
    expect(claimed.map((c) => c.toLowerCase())).toEqual(['0xausdt', '0xdusdt']);
  });

  it('emits a supply position that adds to net equity', () => {
    const { positions } = buildAavePositions(
      [reserve({ supplied: 100n * 10n ** 18n })],
      account({ totalCollateralBase: 100_0000_0000n }),
    );
    const supply = positions.find((p) => p.kind === 'supply')!;
    expect(supply.valueUsd).toBe(100);
    expect(supply.metrics?.supplyApy).toBeGreaterThan(0);
  });

  it('emits a borrow position with NEGATIVE valueUsd (subtracts from equity)', () => {
    const { positions } = buildAavePositions(
      [reserve({ debt: 40n * 10n ** 18n })],
      account({ totalDebtBase: 40_0000_0000n, healthFactor: 2n * 10n ** 18n }),
    );
    const borrow = positions.find((p) => p.kind === 'borrow')!;
    expect(borrow.valueUsd).toBe(-40);
    expect(borrow.debtUsd).toBe(40);
    expect(borrow.legs[0].isDebt).toBe(true);
  });

  it('nets supply minus debt across the summed positions (leveraged equity)', () => {
    const { positions } = buildAavePositions(
      [reserve({ supplied: 100n * 10n ** 18n, debt: 40n * 10n ** 18n })],
      account({
        totalCollateralBase: 100_0000_0000n,
        totalDebtBase: 40_0000_0000n,
        healthFactor: 2n * 10n ** 18n,
      }),
    );
    const total = positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0);
    expect(total).toBe(60); // 100 supplied − 40 debt
  });

  it('renders health factor as null (∞) when there is no debt', () => {
    const { positions } = buildAavePositions(
      [reserve({ supplied: 10n * 10n ** 18n })],
      account({ totalCollateralBase: 10_0000_0000n }),
    );
    const summary = positions.find((p) => p.kind === 'summary')!;
    expect(summary.metrics?.healthFactor).toBeNull();
  });

  it('degrades only the unpriced reserve (null USD), no throw', () => {
    const { positions } = buildAavePositions(
      [reserve({ supplied: 10n * 10n ** 18n, priceUsd: null })],
      account({ totalCollateralBase: 10_0000_0000n }),
    );
    expect(positions.find((p) => p.kind === 'supply')!.valueUsd).toBeNull();
  });

  it('produces no summary row for an empty Aave account', () => {
    const { positions } = buildAavePositions([reserve()], account());
    expect(positions.some((p) => p.kind === 'summary')).toBe(false);
  });
});
