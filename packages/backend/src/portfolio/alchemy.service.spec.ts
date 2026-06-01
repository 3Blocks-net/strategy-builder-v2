import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AlchemyService } from './alchemy.service';

describe('AlchemyService', () => {
  let service: AlchemyService;
  let configGet: jest.Mock;

  beforeEach(async () => {
    configGet = jest.fn((key: string, defaultVal?: string) => {
      const env: Record<string, string> = {
        NODE_ENV: 'production',
        ALCHEMY_API_KEY: 'test-key',
      };
      return env[key] ?? defaultVal;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlchemyService,
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get<AlchemyService>(AlchemyService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses Alchemy response into token positions', async () => {
    const mockResponse = {
      tokens: [
        {
          contractAddress: '0xBUSD',
          symbol: 'BUSD',
          name: 'Binance USD',
          decimals: 18,
          balance: '1000000000000000000',
          prices: [{ value: 1.0 }],
        },
      ],
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const positions = await service.getTokenBalances('0xVault');

    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({
      address: '0xBUSD',
      symbol: 'BUSD',
      name: 'Binance USD',
      decimals: 18,
      balance: '1000000000000000000',
      priceUsd: 1.0,
    });
  });

  it('returns empty on API error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const positions = await service.getTokenBalances('0xVault');
    expect(positions).toEqual([]);
  });

  it('returns empty when ALCHEMY_API_KEY is not set', async () => {
    configGet.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'ALCHEMY_API_KEY') return undefined;
      if (key === 'NODE_ENV') return 'production';
      return defaultVal;
    });

    const positions = await service.getTokenBalances('0xVault');
    expect(positions).toEqual([]);
  });

  it('skips zero-balance tokens', async () => {
    const mockResponse = {
      tokens: [
        {
          contractAddress: '0xBUSD',
          symbol: 'BUSD',
          name: 'Binance USD',
          decimals: 18,
          balance: '0',
          prices: [{ value: 1.0 }],
        },
      ],
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const positions = await service.getTokenBalances('0xVault');
    expect(positions).toEqual([]);
  });

  it('returns empty in dev mode (no local RPC)', async () => {
    configGet.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'NODE_ENV') return 'development';
      return defaultVal;
    });

    const positions = await service.getTokenBalances('0xVault');
    expect(positions).toEqual([]);
  });

  it('batches addresses in groups of 2', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tokens: [] }),
    } as Response);

    await service.getTokenBalancesBatch(['0x1', '0x2', '0x3']);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('handles fetch network error gracefully', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));

    const positions = await service.getTokenBalances('0xVault');
    expect(positions).toEqual([]);
  });
});
