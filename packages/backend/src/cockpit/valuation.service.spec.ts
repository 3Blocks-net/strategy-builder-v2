import { ValuationService } from './valuation.service';
import { ProtocolAdapter, ValuedPosition } from './protocol-adapter';

const VAULT = '0xVault';

function makePortfolio(positions: any[]) {
  return {
    getPortfolio: jest.fn().mockResolvedValue({
      vaultAddress: VAULT,
      positions,
      totalValueUsd: 0,
    }),
  } as any;
}

function makePrice(map: Record<string, number> = {}) {
  return {
    getPrices: jest.fn().mockImplementation(async (addrs: string[]) => {
      const out = new Map();
      for (const a of addrs) {
        if (map[a] != null)
          out.set(a, { address: a, priceUsd: map[a], confidence: 1 });
      }
      return out;
    }),
  } as any;
}

function makeFee(deposit: any) {
  return { getVaultGasDeposit: jest.fn().mockResolvedValue(deposit) } as any;
}

const noGas = {
  enabled: false,
  token: null,
  deposited: '0',
  minFeeDeposit: '0',
};

describe('ValuationService', () => {
  it('sums idle tokens + gas reserve into the net-equity total', async () => {
    const portfolio = makePortfolio([
      {
        address: '0xUSDT',
        symbol: 'USDT',
        name: 'USDT',
        decimals: 18,
        balance: '1000000000000000000',
        priceUsd: 1,
        valueUsd: 1,
        priceSource: 'alchemy',
      },
    ]);
    const fee = makeFee({
      enabled: true,
      token: { address: '0xWBNB', symbol: 'WBNB', decimals: 18 },
      deposited: '2000000000000000000', // 2 WBNB
      minFeeDeposit: '0',
    });
    const price = makePrice({ '0xWBNB': 600 });

    const svc = new ValuationService(portfolio, price, fee, []);
    const res = await svc.valueVault(VAULT);

    // idle USDT ($1) + gas reserve 2 WBNB × $600 = $1201
    expect(res.totalValueUsd).toBeCloseTo(1201);
    expect(res.positions).toHaveLength(2);
    expect(res.positions.find((p) => p.protocol === 'gas-reserve')?.valueUsd).toBe(
      1200,
    );
  });

  it('excludes adapter-claimed tokens from the idle list (no double-count)', async () => {
    const portfolio = makePortfolio([
      {
        address: '0xaUSDT',
        symbol: 'aUSDT',
        name: 'Aave USDT',
        decimals: 18,
        balance: '5000000000000000000',
        priceUsd: 1,
        valueUsd: 5,
        priceSource: 'alchemy',
      },
    ]);
    const adapter: ProtocolAdapter = {
      protocol: 'aave-v3',
      claimedTokens: jest.fn().mockResolvedValue(['0xAUSDT']), // different casing
      getPositions: jest.fn().mockResolvedValue([
        {
          protocol: 'aave-v3',
          kind: 'supply',
          label: 'USDT supply',
          legs: [],
          valueUsd: 5,
        } as ValuedPosition,
      ]),
    };

    const svc = new ValuationService(portfolio, makePrice(), makeFee(noGas), [
      adapter,
    ]);
    const res = await svc.valueVault(VAULT);

    // The aUSDT idle entry is gone; only the adapter's supply remains.
    expect(res.positions.some((p) => p.protocol === 'idle')).toBe(false);
    expect(res.totalValueUsd).toBe(5); // counted once, not twice
  });

  it('degrades only the unpriced position, never the total/page', async () => {
    const portfolio = makePortfolio([
      {
        address: '0xKNOWN',
        symbol: 'KNOWN',
        name: 'Known',
        decimals: 18,
        balance: '1000000000000000000',
        priceUsd: 2,
        valueUsd: 2,
        priceSource: 'alchemy',
      },
      {
        address: '0xMYSTERY',
        symbol: 'MYST',
        name: 'Mystery',
        decimals: 18,
        balance: '1000000000000000000',
        priceUsd: null,
        valueUsd: null,
        priceSource: 'unavailable',
      },
    ]);

    const svc = new ValuationService(portfolio, makePrice(), makeFee(noGas), []);
    const res = await svc.valueVault(VAULT);

    expect(res.totalValueUsd).toBe(2);
    expect(res.positions.find((p) => p.label === 'MYST')?.valueUsd).toBeNull();
  });

  it('isolates a broken adapter into an error row without failing the vault', async () => {
    const portfolio = makePortfolio([]);
    const broken: ProtocolAdapter = {
      protocol: 'pancakeswap-v3',
      claimedTokens: jest.fn().mockResolvedValue([]),
      getPositions: jest.fn().mockRejectedValue(new Error('rpc down')),
    };

    const svc = new ValuationService(portfolio, makePrice(), makeFee(noGas), [
      broken,
    ]);
    const res = await svc.valueVault(VAULT);

    const errRow = res.positions.find((p) => p.kind === 'error');
    expect(errRow?.protocol).toBe('pancakeswap-v3');
    expect(errRow?.error).toBeDefined();
    expect(res.totalValueUsd).toBe(0);
  });

  it('refresh bypasses the cache', async () => {
    const portfolio = makePortfolio([]);
    const svc = new ValuationService(portfolio, makePrice(), makeFee(noGas), []);

    await svc.valueVault(VAULT);
    await svc.valueVault(VAULT); // cached
    expect(portfolio.getPortfolio).toHaveBeenCalledTimes(1);

    await svc.valueVault(VAULT, { refresh: true });
    expect(portfolio.getPortfolio).toHaveBeenCalledTimes(2);
  });
});
