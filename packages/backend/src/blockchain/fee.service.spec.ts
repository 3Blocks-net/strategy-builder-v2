import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FeeService } from './fee.service';

const mockProvider = {
  getLogs: jest.fn(),
  getBlockNumber: jest.fn().mockResolvedValue(100_000),
  destroy: jest.fn(),
};

const mockFeeRegistry = {
  depositFeeBps: jest.fn(),
  withdrawFeeBps: jest.fn(),
};

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    JsonRpcProvider: jest.fn(() => mockProvider),
    Contract: jest.fn((addr: string, abi: any) => {
      const abiStr = JSON.stringify(abi);
      if (abiStr.includes('depositFeeBps')) return mockFeeRegistry;
      return {
        name: jest.fn().mockResolvedValue('Binance USD'),
        symbol: jest.fn().mockResolvedValue('BUSD'),
        decimals: jest.fn().mockResolvedValue(18n),
      };
    }),
  };
});

describe('FeeService', () => {
  let service: FeeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const env: Record<string, string> = {
                RPC_URL: 'http://localhost:8545',
                FEE_REGISTRY_ADDRESS:
                  '0x1234567890123456789012345678901234567890',
              };
              return env[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FeeService>(FeeService);
  });

  describe('getFees', () => {
    it('reads deposit and withdraw fee BPS from on-chain', async () => {
      mockFeeRegistry.depositFeeBps.mockResolvedValue(50n);
      mockFeeRegistry.withdrawFeeBps.mockResolvedValue(100n);

      const fees = await service.getFees();

      expect(fees).toEqual({ depositFeeBps: 50, withdrawFeeBps: 100 });
      expect(mockFeeRegistry.depositFeeBps).toHaveBeenCalledTimes(1);
    });

    it('caches fees and does not call on-chain again within TTL', async () => {
      mockFeeRegistry.depositFeeBps.mockResolvedValue(50n);
      mockFeeRegistry.withdrawFeeBps.mockResolvedValue(100n);

      await service.getFees();
      const second = await service.getFees();

      expect(second).toEqual({ depositFeeBps: 50, withdrawFeeBps: 100 });
      expect(mockFeeRegistry.depositFeeBps).toHaveBeenCalledTimes(1);
    });

    it('re-reads from on-chain after cache expiry', async () => {
      mockFeeRegistry.depositFeeBps.mockResolvedValue(50n);
      mockFeeRegistry.withdrawFeeBps.mockResolvedValue(100n);

      await service.getFees();

      (service as any).feesCache.expiresAt = Date.now() - 1;

      mockFeeRegistry.depositFeeBps.mockResolvedValue(75n);
      mockFeeRegistry.withdrawFeeBps.mockResolvedValue(150n);

      const fees = await service.getFees();

      expect(fees).toEqual({ depositFeeBps: 75, withdrawFeeBps: 150 });
      expect(mockFeeRegistry.depositFeeBps).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAcceptedTokens', () => {
    it('returns accepted tokens from event logs', async () => {
      const { Interface } = jest.requireActual('ethers');
      const iface = new Interface([
        'event TokenAdded(address indexed token, uint8 decimals)',
        'event TokenRemoved(address indexed token)',
      ]);

      const tokenAddr = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
      const addedLog = {
        topics: [
          iface.getEvent('TokenAdded')!.topicHash,
          '0x000000000000000000000000' + tokenAddr.slice(2).toLowerCase(),
        ],
        data: '0x0000000000000000000000000000000000000000000000000000000000000012',
      };

      mockProvider.getLogs
        .mockResolvedValueOnce([addedLog])
        .mockResolvedValueOnce([]);

      const tokens = await service.getAcceptedTokens();

      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toEqual({
        address: tokenAddr,
        symbol: 'BUSD',
        name: 'Binance USD',
        decimals: 18,
      });
    });

    it('caches accepted tokens within TTL', async () => {
      mockProvider.getLogs.mockResolvedValue([]);

      await service.getAcceptedTokens();
      await service.getAcceptedTokens();

      expect(mockProvider.getLogs).toHaveBeenCalledTimes(2);
    });
  });
});
