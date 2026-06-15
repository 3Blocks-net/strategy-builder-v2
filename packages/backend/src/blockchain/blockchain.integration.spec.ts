import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { FeeService, FeeRates, AcceptedToken } from './fee.service';

function mockPrismaService() {
  return {
    nonce: { create: jest.fn(), updateMany: jest.fn() },
    user: { upsert: jest.fn() },
    refreshToken: { create: jest.fn() },
    vault: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
}

describe('Blockchain Integration', () => {
  let app: INestApplication;

  const mockFeeService = {
    getFees: jest.fn<Promise<FeeRates>, []>(),
    getAcceptedTokens: jest.fn<Promise<AcceptedToken[]>, []>(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService())
      .overrideProvider(FeeService)
      .useValue(mockFeeService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /fees', () => {
    it('returns depositFeeBps and withdrawFeeBps', async () => {
      mockFeeService.getFees.mockResolvedValue({
        depositFeeBps: 50,
        withdrawFeeBps: 100,
      });

      const res = await request(app.getHttpServer())
        .get('/fees')
        .expect(200);

      expect(res.body).toEqual({
        depositFeeBps: 50,
        withdrawFeeBps: 100,
      });
    });

    it('is publicly accessible (no auth required)', async () => {
      mockFeeService.getFees.mockResolvedValue({
        depositFeeBps: 50,
        withdrawFeeBps: 100,
      });

      await request(app.getHttpServer()).get('/fees').expect(200);
    });
  });

  describe('GET /tokens/accepted', () => {
    it('returns accepted tokens with metadata', async () => {
      mockFeeService.getAcceptedTokens.mockResolvedValue([
        {
          address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
          symbol: 'BUSD',
          name: 'Binance USD',
          decimals: 18,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/tokens/accepted')
        .expect(200);

      expect(res.body.tokens).toHaveLength(1);
      expect(res.body.tokens[0]).toEqual({
        address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        symbol: 'BUSD',
        name: 'Binance USD',
        decimals: 18,
      });
    });

    it('is publicly accessible (no auth required)', async () => {
      mockFeeService.getAcceptedTokens.mockResolvedValue([]);

      await request(app.getHttpServer()).get('/tokens/accepted').expect(200);
    });
  });

  describe('GET /errors/contract-errors', () => {
    it('returns error mapping with required keys', async () => {
      const res = await request(app.getHttpServer())
        .get('/errors/contract-errors')
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.CallerNotOwner).toBeDefined();
      expect(res.body.errors.TriggerNotMet).toBeDefined();
      expect(res.body.errors.FeeTokenNotAccepted).toBeDefined();
    });

    it('is publicly accessible (no auth required)', async () => {
      await request(app.getHttpServer())
        .get('/errors/contract-errors')
        .expect(200);
    });
  });
});
