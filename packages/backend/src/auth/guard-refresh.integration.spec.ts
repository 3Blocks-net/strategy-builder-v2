import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';

function mockPrismaService() {
  const nonces = new Map<string, any>();
  const users = new Map<string, any>();
  const refreshTokens = new Map<string, any>();

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
      upsert: jest.fn(({ where, create }) => {
        const existing = users.get(where.walletAddress);
        if (existing) return Promise.resolve(existing);
        const newUser = {
          id: `u1`,
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
        refreshTokens.set(data.tokenHash, { id: 'rt1', ...data, createdAt: new Date() });
        return Promise.resolve({ id: 'rt1', ...data });
      }),
      findUnique: jest.fn(({ where }) => {
        return Promise.resolve(refreshTokens.get(where.tokenHash) ?? null);
      }),
      delete: jest.fn(({ where }) => {
        refreshTokens.delete(where.tokenHash);
        return Promise.resolve({});
      }),
    },
    _refreshTokens: refreshTokens,
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
}

const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('Guard + Refresh Integration', () => {
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

  describe('WalletAuthGuard', () => {
    it('allows access to /health without auth', async () => {
      await request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({ status: 'ok' });
    });

    it('allows access to /auth/nonce without auth', async () => {
      await request(app.getHttpServer())
        .get('/auth/nonce')
        .expect(200);
    });

    it('returns 401 UNAUTHORIZED when no Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .expect(401);

      expect(res.body.message).toBe('UNAUTHORIZED');
    });

    it('returns 401 TOKEN_EXPIRED for expired JWT', async () => {
      const expiredToken = jwtService.sign(
        { sub: TEST_ADDRESS },
        { expiresIn: '0s' },
      );

      await new Promise((r) => setTimeout(r, 1100));

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(res.body.message).toBe('TOKEN_EXPIRED');
    });

    it('succeeds with valid JWT and injects wallet address', async () => {
      const token = jwtService.sign({ sub: TEST_ADDRESS });

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.address).toBe(TEST_ADDRESS);
    });

    it('returns 401 UNAUTHORIZED for invalid JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);

      expect(res.body.message).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns new accessToken for valid refresh token', async () => {
      const rawToken = 'a'.repeat(64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      prisma._refreshTokens.set(tokenHash, {
        id: 'rt1',
        tokenHash,
        walletAddress: TEST_ADDRESS,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rawToken })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();

      const decoded = jwtService.verify(res.body.accessToken);
      expect(decoded.sub).toBe(TEST_ADDRESS);
    });

    it('returns 401 REFRESH_TOKEN_INVALID for expired refresh token', async () => {
      const rawToken = 'b'.repeat(64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      prisma._refreshTokens.set(tokenHash, {
        id: 'rt2',
        tokenHash,
        walletAddress: TEST_ADDRESS,
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rawToken })
        .expect(401);

      expect(res.body.message).toBe('REFRESH_TOKEN_INVALID');
    });

    it('returns 401 REFRESH_TOKEN_INVALID for revoked (deleted) refresh token', async () => {
      const rawToken = 'c'.repeat(64);

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rawToken })
        .expect(401);

      expect(res.body.message).toBe('REFRESH_TOKEN_INVALID');
    });
  });
});
