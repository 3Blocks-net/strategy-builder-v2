import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getAddress } from 'ethers';
import { VaultService } from './vault.service';

const OWNER_ADDRESS = getAddress(
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
);
const OTHER_ADDRESS = getAddress(
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
);
const VAULT_ADDRESS = getAddress(
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
);
const DEPOSIT_TOKEN = getAddress(
  '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
);

function mockPrismaService() {
  const nonces = new Map<string, any>();
  const users = new Map<string, any>();
  const refreshTokens = new Map<string, any>();
  const vaults: any[] = [];

  return {
    nonce: {
      create: jest.fn(({ data }) => {
        nonces.set(data.nonce, { ...data, used: false });
        return Promise.resolve({ id: 'n1', ...data, used: false });
      }),
      updateMany: jest.fn(({ where }) => {
        const entry = nonces.get(where.nonce);
        if (entry && !entry.used && entry.expiresAt > new Date()) {
          entry.used = true;
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      }),
    },
    user: {
      upsert: jest.fn(({ where, update, create }) => {
        const existing = users.get(where.walletAddress);
        if (existing) {
          existing.lastLoginAt = update.lastLoginAt;
          return Promise.resolve(existing);
        }
        const newUser = {
          id: `u-${users.size + 1}`,
          walletAddress: create.walletAddress,
          createdAt: new Date(),
          lastLoginAt: create.lastLoginAt,
        };
        users.set(create.walletAddress, newUser);
        return Promise.resolve(newUser);
      }),
    },
    refreshToken: {
      create: jest.fn(({ data }) => {
        const entry = {
          id: `rt-${refreshTokens.size + 1}`,
          ...data,
          createdAt: new Date(),
        };
        refreshTokens.set(data.tokenHash, entry);
        return Promise.resolve(entry);
      }),
    },
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
              (v: any) =>
                v.ownerAddress === where.ownerAddress_label.ownerAddress &&
                v.label === where.ownerAddress_label.label,
            ) ?? null,
          );
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          vaults.filter((v) => v.ownerAddress === where.ownerAddress),
        ),
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
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
}

describe('Vault Integration', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof mockPrismaService>;
  let jwtService: JwtService;
  let ownerToken: string;
  let otherToken: string;

  beforeEach(async () => {
    prisma = mockPrismaService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
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

  describe('POST /vaults', () => {
    it('creates a vault with default label', async () => {
      const res = await request(app.getHttpServer())
        .post('/vaults')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          address: VAULT_ADDRESS,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xabc123',
          createdAtBlock: 12345,
        })
        .expect(201);

      expect(res.body.address).toBe(VAULT_ADDRESS);
      expect(res.body.label).toBe('Vault #1');
      expect(res.body.ownerAddress).toBe(OWNER_ADDRESS);
    });

    it('creates a vault with custom label', async () => {
      const res = await request(app.getHttpServer())
        .post('/vaults')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          address: VAULT_ADDRESS,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xabc123',
          createdAtBlock: 12345,
          label: 'My DCA',
        })
        .expect(201);

      expect(res.body.label).toBe('My DCA');
    });

    it('returns 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/vaults')
        .send({
          address: VAULT_ADDRESS,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xabc123',
          createdAtBlock: 12345,
        })
        .expect(401);
    });

    it('returns 409 for duplicate vault address', async () => {
      await request(app.getHttpServer())
        .post('/vaults')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          address: VAULT_ADDRESS,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xabc',
          createdAtBlock: 100,
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/vaults')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          address: VAULT_ADDRESS,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xdef',
          createdAtBlock: 200,
        })
        .expect(409);

      expect(res.body.message).toBe('VAULT_ALREADY_REGISTERED');
    });

    it('returns 409 for duplicate label per user', async () => {
      await request(app.getHttpServer())
        .post('/vaults')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          address: VAULT_ADDRESS,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xabc',
          createdAtBlock: 100,
          label: 'Same Name',
        })
        .expect(201);

      const secondVault = getAddress(
        '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
      );

      const res = await request(app.getHttpServer())
        .post('/vaults')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          address: secondVault,
          chainId: 56,
          depositToken: DEPOSIT_TOKEN,
          txHash: '0xdef',
          createdAtBlock: 200,
          label: 'Same Name',
        })
        .expect(409);

      expect(res.body.message).toBe('LABEL_ALREADY_EXISTS');
    });
  });

  describe('GET /vaults', () => {
    it('returns only vaults for authenticated user', async () => {
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
          ownerAddress: OTHER_ADDRESS,
          depositToken: DEPOSIT_TOKEN,
          label: 'Vault #1',
          createdAtBlock: 200,
          txHash: '0xdef',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );

      const res = await request(app.getHttpServer())
        .get('/vaults')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].ownerAddress).toBe(OWNER_ADDRESS);
    });

    it('returns 401 for unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/vaults').expect(401);
    });
  });

  describe('PATCH /vaults/:address', () => {
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

    it('updates vault label for owner', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/vaults/${VAULT_ADDRESS}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ label: 'Renamed' })
        .expect(200);

      expect(res.body.label).toBe('Renamed');
    });

    it('returns 403 for non-owner via VaultOwnerGuard', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/vaults/${VAULT_ADDRESS}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ label: 'Hack' })
        .expect(403);

      expect(res.body.message).toBe('NOT_VAULT_OWNER');
    });

    it('returns 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .patch(`/vaults/${VAULT_ADDRESS}`)
        .send({ label: 'Nope' })
        .expect(401);
    });

    it('returns 404 for non-existent vault', async () => {
      const fakeAddress = getAddress(
        '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
      );

      const res = await request(app.getHttpServer())
        .patch(`/vaults/${fakeAddress}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ label: 'Ghost' })
        .expect(404);

      expect(res.body.message).toBe('VAULT_NOT_FOUND');
    });

    it('returns 409 for duplicate label per user', async () => {
      prisma._vaults.push({
        id: 'v-2',
        address: '0x1111111111111111111111111111111111111111',
        chainId: 56,
        ownerAddress: OWNER_ADDRESS,
        depositToken: DEPOSIT_TOKEN,
        label: 'Taken',
        createdAtBlock: 200,
        txHash: '0xdef',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .patch(`/vaults/${VAULT_ADDRESS}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ label: 'Taken' })
        .expect(409);

      expect(res.body.message).toBe('LABEL_ALREADY_EXISTS');
    });
  });
});
