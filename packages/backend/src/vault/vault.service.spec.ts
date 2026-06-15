import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { VaultService } from './vault.service';
import { PrismaService } from '../database/prisma.service';
import { getAddress } from 'ethers';

const OWNER_ADDRESS = getAddress(
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
);
const VAULT_ADDRESS = getAddress(
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
);
const DEPOSIT_TOKEN = getAddress(
  '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
);

function mockPrisma() {
  const vaults: any[] = [];

  return {
    vault: {
      findUnique: jest.fn(({ where }) => {
        if (where.address) {
          return Promise.resolve(
            vaults.find((v) => v.address === where.address) ?? null,
          );
        }
        if (where.ownerAddress_label) {
          return Promise.resolve(
            vaults.find(
              (v) =>
                v.ownerAddress === where.ownerAddress_label.ownerAddress &&
                v.label === where.ownerAddress_label.label,
            ) ?? null,
          );
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn(({ where }) =>
        Promise.resolve(vaults.filter((v) => v.ownerAddress === where.ownerAddress)),
      ),
      create: jest.fn(({ data }) => {
        const vault = {
          id: `v-${vaults.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        vaults.push(vault);
        return Promise.resolve(vault);
      }),
      update: jest.fn(({ where, data }) => {
        const vault = vaults.find((v) => v.address === where.address);
        if (vault) Object.assign(vault, data, { updatedAt: new Date() });
        return Promise.resolve(vault);
      }),
      count: jest.fn(({ where }) =>
        Promise.resolve(
          vaults.filter((v) => v.ownerAddress === where.ownerAddress).length,
        ),
      ),
    },
    _vaults: vaults,
  };
}

describe('VaultService', () => {
  let service: VaultService;
  let prisma: ReturnType<typeof mockPrisma>;
  let configService: ConfigService;

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const env: Record<string, string> = {
                RPC_URL: 'http://localhost:8545',
                FACTORY_ADDRESS: '0x1234567890123456789012345678901234567890',
              };
              return env[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<VaultService>(VaultService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('createVault', () => {
    it('rejects invalid vault address', async () => {
      await expect(
        service.createVault(OWNER_ADDRESS, {
          address: 'not-an-address',
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xabc',
          createdAtBlock: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate vault address', async () => {
      prisma._vaults.push({
        id: 'v-existing',
        address: VAULT_ADDRESS,
        chainId: 56,
        ownerAddress: OWNER_ADDRESS,
        depositToken: DEPOSIT_TOKEN,
        label: 'Vault #1',
        createdAtBlock: 100,
        txHash: '0xabc',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.createVault(OWNER_ADDRESS, {
          address: VAULT_ADDRESS,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xdef',
          createdAtBlock: 200,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('generates default label "Vault #1" for first vault', async () => {
      const validateSpy = jest
        .spyOn(service as any, 'validateOnChain')
        .mockResolvedValue(undefined);

      const vault = await service.createVault(OWNER_ADDRESS, {
        address: VAULT_ADDRESS,
        chainId: 56,
        depositToken: DEPOSIT_TOKEN,
        txHash: '0xabc',
        createdAtBlock: 100,
      });

      expect(vault.label).toBe('Vault #1');
      validateSpy.mockRestore();
    });

    it('increments default label counter per user', async () => {
      prisma._vaults.push({
        id: 'v-existing',
        address: '0x1111111111111111111111111111111111111111',
        chainId: 56,
        ownerAddress: OWNER_ADDRESS,
        depositToken: DEPOSIT_TOKEN,
        label: 'Vault #1',
        createdAtBlock: 100,
        txHash: '0xaaa',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const validateSpy = jest
        .spyOn(service as any, 'validateOnChain')
        .mockResolvedValue(undefined);

      const vault = await service.createVault(OWNER_ADDRESS, {
        address: VAULT_ADDRESS,
        chainId: 56,
        depositToken: DEPOSIT_TOKEN,
        txHash: '0xbbb',
        createdAtBlock: 200,
      });

      expect(vault.label).toBe('Vault #2');
      validateSpy.mockRestore();
    });

    it('uses provided label instead of default', async () => {
      const validateSpy = jest
        .spyOn(service as any, 'validateOnChain')
        .mockResolvedValue(undefined);

      const vault = await service.createVault(OWNER_ADDRESS, {
        address: VAULT_ADDRESS,
        chainId: 56,
        depositToken: DEPOSIT_TOKEN,
        txHash: '0xabc',
        createdAtBlock: 100,
        label: 'My DCA Vault',
      });

      expect(vault.label).toBe('My DCA Vault');
      validateSpy.mockRestore();
    });

    it('rejects duplicate label for same user', async () => {
      prisma._vaults.push({
        id: 'v-existing',
        address: '0x1111111111111111111111111111111111111111',
        chainId: 56,
        ownerAddress: OWNER_ADDRESS,
        depositToken: DEPOSIT_TOKEN,
        label: 'My Vault',
        createdAtBlock: 100,
        txHash: '0xaaa',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const validateSpy = jest
        .spyOn(service as any, 'validateOnChain')
        .mockResolvedValue(undefined);

      await expect(
        service.createVault(OWNER_ADDRESS, {
          address: VAULT_ADDRESS,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xbbb',
          createdAtBlock: 200,
          label: 'My Vault',
        }),
      ).rejects.toThrow(ConflictException);

      validateSpy.mockRestore();
    });

    it('throws when on-chain validation is not configured', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(
        service.createVault(OWNER_ADDRESS, {
          address: VAULT_ADDRESS,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xabc',
          createdAtBlock: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listVaults', () => {
    it('returns only vaults for the given owner', async () => {
      const otherOwner = getAddress(
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      );

      prisma._vaults.push(
        {
          id: 'v-1',
          address: VAULT_ADDRESS,
          chainId: 56,
          ownerAddress: OWNER_ADDRESS,
          depositToken: DEPOSIT_TOKEN,
          label: 'Vault #1',
          createdAtBlock: 100,
          txHash: '0xabc',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'v-2',
          address: '0x1111111111111111111111111111111111111111',
          chainId: 56,
          ownerAddress: otherOwner,
          depositToken: DEPOSIT_TOKEN,
          label: 'Vault #1',
          createdAtBlock: 200,
          txHash: '0xdef',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );

      const vaults = await service.listVaults(OWNER_ADDRESS);
      expect(vaults).toHaveLength(1);
      expect(vaults[0].ownerAddress).toBe(OWNER_ADDRESS);
    });

    it('returns empty array when user has no vaults', async () => {
      const vaults = await service.listVaults(OWNER_ADDRESS);
      expect(vaults).toEqual([]);
    });
  });

  describe('updateLabel', () => {
    beforeEach(() => {
      prisma._vaults.push({
        id: 'v-1',
        address: VAULT_ADDRESS,
        chainId: 56,
        ownerAddress: OWNER_ADDRESS,
        depositToken: DEPOSIT_TOKEN,
        label: 'Vault #1',
        createdAtBlock: 100,
        txHash: '0xabc',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('updates vault label', async () => {
      const updated = await service.updateLabel(
        VAULT_ADDRESS,
        OWNER_ADDRESS,
        'New Label',
      );
      expect(updated.label).toBe('New Label');
    });

    it('allows setting the same label on the same vault', async () => {
      const updated = await service.updateLabel(
        VAULT_ADDRESS,
        OWNER_ADDRESS,
        'Vault #1',
      );
      expect(updated.label).toBe('Vault #1');
    });

    it('rejects duplicate label for same user on different vault', async () => {
      prisma._vaults.push({
        id: 'v-2',
        address: '0x1111111111111111111111111111111111111111',
        chainId: 56,
        ownerAddress: OWNER_ADDRESS,
        depositToken: DEPOSIT_TOKEN,
        label: 'Taken Label',
        createdAtBlock: 200,
        txHash: '0xdef',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.updateLabel(VAULT_ADDRESS, OWNER_ADDRESS, 'Taken Label'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
