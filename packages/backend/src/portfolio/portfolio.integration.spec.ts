import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { VaultPortfolioService } from './vault-portfolio.service';
import { VaultService } from '../vault/vault.service';
import { getAddress } from 'ethers';

const OWNER_ADDRESS = getAddress(
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
);
const OTHER_ADDRESS = getAddress(
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
);
const VAULT_ADDRESS = getAddress(
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
);

function mockPrismaService() {
  const vaults: any[] = [];

  return {
    nonce: { create: jest.fn(), updateMany: jest.fn() },
    user: { upsert: jest.fn() },
    refreshToken: { create: jest.fn() },
    vault: {
      findUnique: jest.fn(({ where }: any) => {
        if (where.address)
          return Promise.resolve(
            vaults.find((v) => v.address === where.address) ?? null,
          );
        if (where.ownerAddress_label)
          return Promise.resolve(
            vaults.find(
              (v: any) =>
                v.ownerAddress === where.ownerAddress_label.ownerAddress &&
                v.label === where.ownerAddress_label.label,
            ) ?? null,
          );
        return Promise.resolve(null);
      }),
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          vaults.filter((v) => v.ownerAddress === where.ownerAddress),
        ),
      ),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    _vaults: vaults,
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
}

describe('Portfolio Integration', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof mockPrismaService>;
  let jwtService: JwtService;
  let ownerToken: string;
  let otherToken: string;

  const mockPortfolioService = {
    getPortfolio: jest.fn(),
    getOverview: jest.fn(),
  };

  beforeEach(async () => {
    prisma = mockPrismaService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(VaultPortfolioService)
      .useValue(mockPortfolioService)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);

    const vaultService = moduleFixture.get(VaultService);
    jest
      .spyOn(vaultService as any, 'validateOnChain')
      .mockResolvedValue(undefined);

    await app.init();

    ownerToken = jwtService.sign({ sub: OWNER_ADDRESS });
    otherToken = jwtService.sign({ sub: OTHER_ADDRESS });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /vaults/:address/portfolio', () => {
    beforeEach(() => {
      prisma._vaults.push({
        id: 'v-1',
        address: VAULT_ADDRESS,
        chainId: 56,
        ownerAddress: OWNER_ADDRESS,
        depositToken: '0xBUSD',
        label: 'Vault #1',
        createdAtBlock: 100,
        txHash: '0xabc',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('returns portfolio for vault owner', async () => {
      mockPortfolioService.getPortfolio.mockResolvedValue({
        vaultAddress: VAULT_ADDRESS,
        positions: [
          {
            address: '0xBUSD',
            symbol: 'BUSD',
            name: 'Binance USD',
            decimals: 18,
            balance: '1000000000000000000',
            priceUsd: 1.0,
            valueUsd: 1.0,
            priceSource: 'alchemy',
          },
        ],
        totalValueUsd: 1.0,
      });

      const res = await request(app.getHttpServer())
        .get(`/vaults/${VAULT_ADDRESS}/portfolio`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.vaultAddress).toBe(VAULT_ADDRESS);
      expect(res.body.positions).toHaveLength(1);
      expect(res.body.totalValueUsd).toBe(1.0);
    });

    it('returns 403 for non-owner', async () => {
      await request(app.getHttpServer())
        .get(`/vaults/${VAULT_ADDRESS}/portfolio`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('returns 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`/vaults/${VAULT_ADDRESS}/portfolio`)
        .expect(401);
    });
  });

  describe('GET /vaults/overview', () => {
    it('returns overview with totalValueUsd per vault', async () => {
      prisma._vaults.push({
        id: 'v-1',
        address: VAULT_ADDRESS,
        chainId: 56,
        ownerAddress: OWNER_ADDRESS,
        depositToken: '0xBUSD',
        label: 'Vault #1',
        createdAtBlock: 100,
        txHash: '0xabc',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPortfolioService.getOverview.mockResolvedValue([
        {
          address: VAULT_ADDRESS,
          label: 'Vault #1',
          depositToken: '0xBUSD',
          chainId: 56,
          totalValueUsd: 500.0,
          createdAt: new Date(),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/vaults/overview')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.vaults).toHaveLength(1);
      expect(res.body.vaults[0].totalValueUsd).toBe(500.0);
    });

    it('returns 401 for unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/vaults/overview').expect(401);
    });
  });
});
