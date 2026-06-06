import { getAddress } from 'ethers';
import {
  validateClaimedTokens,
  validateLogSubscription,
  validatePositions,
  validateValuedPosition,
} from './conformance';
import { ValuedPosition } from './protocol-adapter';
import { LogSubscription } from '../indexer/protocol-flow';
import { AaveV3Adapter } from './aave/aave-v3.adapter';
import { PancakeV3Adapter } from './pancakeswap/pancake-v3.adapter';
import {
  AaveReserveRead,
  buildAavePositions,
} from './aave/aave-positions';
import { buildAaveLogSubscriptions } from './aave/aave-subscriptions';
import { RAY } from './aave/aave-math';
import { buildLpPosition } from './pancakeswap/lp-position';
import { getSqrtRatioAtTick } from './pancakeswap/lp-math';

const POOL = getAddress('0x6807dc923806fE8Fd134338EABCA509979a7e0cB');
const USDT = getAddress('0x55d398326f99059fF775485246999027B3197955');
const WBNB = getAddress('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c');
const ATOKEN = getAddress('0x00000000000000000000000000000000000000a1');
const VDEBT = getAddress('0x00000000000000000000000000000000000000d1');

const aaveReserve = (over: Partial<AaveReserveRead>): AaveReserveRead => ({
  asset: USDT,
  symbol: 'USDT',
  decimals: 18,
  aToken: ATOKEN,
  variableDebtToken: VDEBT,
  supplied: 0n,
  debt: 0n,
  priceUsd: 1,
  supplyRateRay: (3n * RAY) / 100n,
  borrowRateRay: (6n * RAY) / 100n,
  ...over,
});

/**
 * Conformance fixtures: each adapter contributes representative real outputs via
 * its pure builders (exactly what the adapter's methods return). Adding a new
 * protocol = add one entry here.
 */
const ADAPTERS = [
  {
    name: 'AaveV3Adapter',
    cls: AaveV3Adapter,
    positions: (): ValuedPosition[] =>
      buildAavePositions(
        [
          aaveReserve({ supplied: 100n * 10n ** 18n }), // supply leg
          aaveReserve({
            asset: WBNB,
            symbol: 'WBNB',
            aToken: getAddress('0x00000000000000000000000000000000000000a2'),
            variableDebtToken: getAddress(
              '0x00000000000000000000000000000000000000d2',
            ),
            debt: 40n * 10n ** 18n, // borrow leg
          }),
        ],
        {
          totalCollateralBase: 100_0000_0000n,
          totalDebtBase: 40_0000_0000n,
          healthFactor: 2n * 10n ** 18n,
        },
      ).positions,
    subscriptions: (): LogSubscription[] => buildAaveLogSubscriptions(POOL),
  },
  {
    name: 'PancakeV3Adapter',
    cls: PancakeV3Adapter,
    positions: (): ValuedPosition[] => [
      buildLpPosition({
        tokenId: 1n,
        token0: USDT,
        token1: WBNB,
        fee: 500,
        tickLower: -60,
        tickUpper: 60,
        liquidity: 10n ** 18n,
        sqrtPriceX96: getSqrtRatioAtTick(0),
        currentTick: 0,
        decimals0: 18,
        symbol0: 'USDT',
        decimals1: 18,
        symbol1: 'WBNB',
        uncollected0: 0n,
        uncollected1: 0n,
        price0: 1,
        price1: 600,
      }),
    ],
    subscriptions: (): LogSubscription[] => [],
  },
];

describe.each(ADAPTERS)('ProtocolAdapter conformance: $name', (a) => {
  it('emits well-formed ValuedPositions (contract + debt sign convention)', () => {
    expect(validatePositions(a.positions())).toEqual([]);
  });

  it('exposes the required adapter methods', () => {
    expect(typeof a.cls.prototype.getPositions).toBe('function');
    expect(typeof a.cls.prototype.claimedTokens).toBe('function');
  });

  it('log subscriptions (if any) are well-formed', () => {
    for (const sub of a.subscriptions()) {
      expect(validateLogSubscription(sub)).toEqual([]);
    }
  });
});

describe('claimedTokens conformance', () => {
  it('Aave: non-empty valid aToken + variableDebtToken addresses', () => {
    const { claimed } = buildAavePositions([aaveReserve({})], {
      totalCollateralBase: 0n,
      totalDebtBase: 0n,
      healthFactor: 0n,
    });
    expect(validateClaimedTokens(claimed)).toEqual([]);
  });

  it('PancakeSwap: real (RPC-free) method claims the NPM address', async () => {
    const pcs = new PancakeV3Adapter({ get: () => undefined } as any, {
      getPrices: async () => new Map(),
    } as any);
    expect(validateClaimedTokens(await pcs.claimedTokens())).toEqual([]);
  });
});

describe('the validator rejects a non-conforming adapter clearly', () => {
  it('flags a debt position with positive equity + a float amount', () => {
    const bad = {
      protocol: 'x',
      kind: 'borrow',
      label: 'bad',
      legs: [
        {
          token: '0xnope',
          symbol: 'X',
          decimals: 18,
          amount: 1.5,
          amountUsd: 1,
          isDebt: true,
        },
      ],
      valueUsd: 5, // debt but positive equity
    } as unknown as ValuedPosition;

    const errs = validateValuedPosition(bad);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join(' ')).toContain('valueUsd ≤ 0');
  });
});
