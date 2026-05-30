import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Wallet } from 'ethers';
import { SiweMessage } from 'siwe';
import { createHash } from 'crypto';

const TEST_WALLET = new Wallet(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
);
const DOMAIN = 'localhost';

function mockPrismaService() {
  const nonces = new Map<string, { nonce: string; expiresAt: Date; used: boolean }>();
  const users = new Map<string, { id: string; walletAddress: string; createdAt: Date; lastLoginAt: Date }>();
  const refreshTokens = new Map<string, { id: string; tokenHash: string; walletAddress: string; expiresAt: Date; createdAt: Date }>();

  return {
    nonce: {
      create: jest.fn(({ data }) => {
        nonces.set(data.nonce, { ...data, used: false });
        return Promise.resolve({ id: 'n1', ...data, used: false });
      }),
      updateMany: jest.fn(({ where, data }) => {
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
        const entry = { id: `rt-${refreshTokens.size + 1}`, ...data, createdAt: new Date() };
        refreshTokens.set(data.tokenHash, entry);
        return Promise.resolve(entry);
      }),
    },
    _nonces: nonces,
    _users: users,
    _refreshTokens: refreshTokens,
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
}

async function createSignedSiweMessage(nonce: string, overrides?: Partial<SiweMessage>) {
  const message = new SiweMessage({
    domain: DOMAIN,
    address: TEST_WALLET.address,
    statement: 'Sign in to Pecunity',
    uri: `http://${DOMAIN}`,
    version: '1',
    chainId: 56,
    nonce,
    issuedAt: new Date().toISOString(),
    ...overrides,
  });
  const messageString = message.prepareMessage();
  const signature = await TEST_WALLET.signMessage(messageString);
  return { messageString, signature };
}

describe('Auth Integration', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof mockPrismaService>;
  let jwtService: JwtService;

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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /auth/nonce', () => {
    it('returns a nonce string and stores it in the database', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/nonce')
        .expect(200);

      expect(res.body.nonce).toBeDefined();
      expect(typeof res.body.nonce).toBe('string');
      expect(res.body.nonce.length).toBeGreaterThanOrEqual(16);
      expect(prisma.nonce.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nonce: res.body.nonce,
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('POST /auth/verify', () => {
    it('returns accessToken and refreshToken for valid EOA signature', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/auth/nonce')
        .expect(200);

      const { messageString, signature } = await createSignedSiweMessage(
        nonceRes.body.nonce,
      );

      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: messageString, signature })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      const decoded = jwtService.verify(res.body.accessToken);
      expect(decoded.sub).toBe(TEST_WALLET.address);
    });

    it('stores refresh token hashed in database', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/auth/nonce');
      const { messageString, signature } = await createSignedSiweMessage(
        nonceRes.body.nonce,
      );

      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: messageString, signature })
        .expect(201);

      const expectedHash = createHash('sha256')
        .update(res.body.refreshToken)
        .digest('hex');
      expect(prisma._refreshTokens.has(expectedHash)).toBe(true);
    });

    it('returns 401 NONCE_INVALID for expired nonce', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/auth/nonce');

      const entry = prisma._nonces.get(nonceRes.body.nonce);
      if (entry) entry.expiresAt = new Date(Date.now() - 1000);

      const { messageString, signature } = await createSignedSiweMessage(
        nonceRes.body.nonce,
      );

      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: messageString, signature })
        .expect(401);

      expect(res.body.message).toBe('NONCE_INVALID');
    });

    it('returns 401 NONCE_INVALID for reused nonce', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/auth/nonce');

      const { messageString, signature } = await createSignedSiweMessage(
        nonceRes.body.nonce,
      );

      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: messageString, signature })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: messageString, signature })
        .expect(401);

      expect(res.body.message).toBe('NONCE_INVALID');
    });

    it('returns 401 SIGNATURE_INVALID for invalid signature', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/auth/nonce');

      const { messageString } = await createSignedSiweMessage(
        nonceRes.body.nonce,
      );

      const otherWallet = Wallet.createRandom();
      const wrongSignature = await otherWallet.signMessage(messageString);

      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: messageString, signature: wrongSignature })
        .expect(401);

      expect(res.body.message).toBe('SIGNATURE_INVALID');
    });

    it('returns 401 SIGNATURE_INVALID for mismatched SIWE domain', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/auth/nonce');

      const { messageString, signature } = await createSignedSiweMessage(
        nonceRes.body.nonce,
        { domain: 'evil.com' },
      );

      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: messageString, signature })
        .expect(401);

      expect(res.body.message).toBe('SIGNATURE_INVALID');
    });

    it('creates a User record on first login', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/auth/nonce');
      const { messageString, signature } = await createSignedSiweMessage(
        nonceRes.body.nonce,
      );

      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: messageString, signature })
        .expect(201);

      expect(prisma.user.upsert).toHaveBeenCalled();
      expect(prisma._users.has(TEST_WALLET.address)).toBe(true);
    });

    it('updates lastLoginAt on repeat login', async () => {
      const nonce1Res = await request(app.getHttpServer()).get('/auth/nonce');
      const msg1 = await createSignedSiweMessage(nonce1Res.body.nonce);
      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: msg1.messageString, signature: msg1.signature })
        .expect(201);

      const firstLogin = prisma._users.get(TEST_WALLET.address)!.lastLoginAt;

      await new Promise((r) => setTimeout(r, 10));

      const nonce2Res = await request(app.getHttpServer()).get('/auth/nonce');
      const msg2 = await createSignedSiweMessage(nonce2Res.body.nonce);
      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: msg2.messageString, signature: msg2.signature })
        .expect(201);

      const secondLogin = prisma._users.get(TEST_WALLET.address)!.lastLoginAt;
      expect(secondLogin.getTime()).toBeGreaterThan(firstLogin.getTime());
    });

    it('accepts any EVM chain ID (chain-agnostic)', async () => {
      const nonceRes = await request(app.getHttpServer()).get('/auth/nonce');
      const { messageString, signature } = await createSignedSiweMessage(
        nonceRes.body.nonce,
        { chainId: 97 },
      );

      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ message: messageString, signature })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
    });
  });
});
