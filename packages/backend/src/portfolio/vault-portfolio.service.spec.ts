import { Test, TestingModule } from '@nestjs/testing';
import { VaultPortfolioService } from './vault-portfolio.service';
import { AlchemyService } from './alchemy.service';
import { PriceService } from './price.service';

describe('VaultPortfolioService', () => {
  let service: VaultPortfolioService;
  let alchemyService: AlchemyService;
  let priceService: PriceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultPortfolioService,
        {
          provide: AlchemyService,
          useValue: {
            getTokenBalances: jest.fn().mockResolvedValue([]),
            getTokenBalancesBatch: jest.fn().mockResolvedValue(new Map()),
          },
        },
        {
          provide: PriceService,
          useValue: {
            getPrices: jest.fn().mockResolvedValue(new Map()),
          },
        },
      ],
    }).compile();

    service = module.get<VaultPortfolioService>(VaultPortfolioService);
    alchemyService = module.get<AlchemyService>(AlchemyService);
    priceService = module.get<PriceService>(PriceService);
  });

  it('returns portfolio with alchemy price source', async () => {
    jest.spyOn(alchemyService, 'getTokenBalances').mockResolvedValue([
      {
        address: '0xBUSD',
        symbol: 'BUSD',
        name: 'Binance USD',
        decimals: 18,
        balance: '1000000000000000000',
        priceUsd: 1.0,
      },
    ]);

    const portfolio = await service.getPortfolio('0xVault');

    expect(portfolio.positions).toHaveLength(1);
    expect(portfolio.positions[0].priceSource).toBe('alchemy');
    expect(portfolio.positions[0].priceUsd).toBe(1.0);
    expect(portfolio.totalValueUsd).toBe(1.0);
  });

  it('falls back to DeFiLlama when Alchemy has no price', async () => {
    jest.spyOn(alchemyService, 'getTokenBalances').mockResolvedValue([
      {
        address: '0xBUSD',
        symbol: 'BUSD',
        name: 'Binance USD',
        decimals: 18,
        balance: '1000000000000000000',
        priceUsd: null,
      },
    ]);

    jest.spyOn(priceService, 'getPrices').mockResolvedValue(
      new Map([
        [
          '0xBUSD',
          { address: '0xBUSD', priceUsd: 0.99, confidence: 0.98 },
        ],
      ]),
    );

    const portfolio = await service.getPortfolio('0xVault');

    expect(portfolio.positions[0].priceSource).toBe('defi-llama');
    expect(portfolio.positions[0].priceUsd).toBe(0.99);
  });

  it('marks price as unavailable when neither source has it', async () => {
    jest.spyOn(alchemyService, 'getTokenBalances').mockResolvedValue([
      {
        address: '0xUnknown',
        symbol: 'UNK',
        name: 'Unknown',
        decimals: 18,
        balance: '1000000000000000000',
        priceUsd: null,
      },
    ]);

    jest.spyOn(priceService, 'getPrices').mockResolvedValue(new Map());

    const portfolio = await service.getPortfolio('0xVault');

    expect(portfolio.positions[0].priceSource).toBe('unavailable');
    expect(portfolio.positions[0].priceUsd).toBeNull();
    expect(portfolio.positions[0].valueUsd).toBeNull();
  });

  it('caches portfolio for 60s', async () => {
    const spy = jest
      .spyOn(alchemyService, 'getTokenBalances')
      .mockResolvedValue([]);

    await service.getPortfolio('0xVault');
    await service.getPortfolio('0xVault');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after cache expiry', async () => {
    const spy = jest
      .spyOn(alchemyService, 'getTokenBalances')
      .mockResolvedValue([]);

    await service.getPortfolio('0xVault');

    const cacheEntry = (service as any).cache.get('0xVault');
    cacheEntry.expiresAt = Date.now() - 1;

    await service.getPortfolio('0xVault');

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('computes totalValueUsd across multiple positions', async () => {
    jest.spyOn(alchemyService, 'getTokenBalances').mockResolvedValue([
      {
        address: '0xBUSD',
        symbol: 'BUSD',
        name: 'Binance USD',
        decimals: 18,
        balance: '2000000000000000000',
        priceUsd: 1.0,
      },
      {
        address: '0xBNB',
        symbol: 'WBNB',
        name: 'Wrapped BNB',
        decimals: 18,
        balance: '1000000000000000000',
        priceUsd: 300.0,
      },
    ]);

    const portfolio = await service.getPortfolio('0xVault');
    expect(portfolio.totalValueUsd).toBe(302.0);
  });

  describe('getOverview', () => {
    it('returns totalValueUsd per vault', async () => {
      jest.spyOn(alchemyService, 'getTokenBalancesBatch').mockResolvedValue(
        new Map([
          [
            '0xVault1',
            [
              {
                address: '0xBUSD',
                symbol: 'BUSD',
                name: 'Binance USD',
                decimals: 18,
                balance: '5000000000000000000',
                priceUsd: 1.0,
              },
            ],
          ],
        ]),
      );

      const overview = await service.getOverview([
        {
          address: '0xVault1',
          label: 'Vault #1',
          depositToken: '0xBUSD',
          chainId: 56,
          createdAt: new Date(),
        },
      ]);

      expect(overview).toHaveLength(1);
      expect(overview[0].totalValueUsd).toBe(5.0);
      expect(overview[0].label).toBe('Vault #1');
    });
  });
});
