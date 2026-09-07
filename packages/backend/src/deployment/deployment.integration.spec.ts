import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { ChainIdProbe } from './chain-id.probe';
import { DeploymentFile } from './deployment-addresses';
import { DeploymentService } from './deployment.service';

const FILE_PATH = '/repo/packages/contracts/deployments/fork-latest.json';
const FACTORY = '0xD3Af54Ad7aA6798DFebe68cA7858157F8FE6a3f6';
const FEE_REGISTRY = '0x056763F1393CB2d47FFB56C04BB08E6231d3b753';

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

const deployOutput: DeploymentFile = {
  path: FILE_PATH,
  load: () => ({
    ok: true,
    addresses: {
      StrategyBuilderVaultFactory: FACTORY,
      FeeRegistry: FEE_REGISTRY,
    },
  }),
};

const missingDeployOutput: DeploymentFile = {
  path: FILE_PATH,
  load: () => ({ ok: false, reason: 'the file does not exist' }),
};

/**
 * The endpoint is exercised against a controlled resolver: the developer's own
 * `.env` must not decide whether this test passes.
 */
async function createApp(options: {
  file?: DeploymentFile;
  probe?: ChainIdProbe;
  env?: Record<string, string | undefined>;
}): Promise<INestApplication> {
  const env = options.env ?? { RPC_URL: 'http://localhost:8545' };
  const deployment = new DeploymentService(
    { get: (key: string) => env[key] } as unknown as ConfigService,
    options.file ?? deployOutput,
    options.probe ?? (async () => 31337),
  );

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrismaService())
    .overrideProvider(DeploymentService)
    .useValue(deployment)
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}

describe('GET /config (deployment configuration)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('answers without a login and names chain and contracts', async () => {
    app = await createApp({});

    const res = await request(app.getHttpServer()).get('/config').expect(200);

    expect(res.body).toEqual({
      chainId: 31337,
      chainIdProblem: null,
      factoryAddress: FACTORY,
      feeRegistryAddress: FEE_REGISTRY,
      pancakeFactoryAddress: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    });
  });

  it('reports a missing deployment instead of answering with a gap', async () => {
    app = await createApp({ file: missingDeployOutput });

    const res = await request(app.getHttpServer()).get('/config').expect(503);

    expect(res.body.message).toContain('pnpm contracts:deploy:fork');
  });

  /**
   * The endpoint needs no login, so its answer must not describe where this
   * server keeps its files. The next step still has to be in there.
   */
  it('keeps the server path out of an answer anyone can ask for', async () => {
    app = await createApp({ file: missingDeployOutput });

    const res = await request(app.getHttpServer()).get('/config').expect(503);

    expect(JSON.stringify(res.body)).not.toContain(FILE_PATH);
    expect(JSON.stringify(res.body)).not.toContain('/repo/');
    expect(res.body.message).toContain(
      'packages/contracts/deployments/fork-latest.json',
    );
  });

  /**
   * The addresses are the point of this endpoint. A fork that is not running
   * must not turn three known addresses into "the backend is unreachable".
   */
  it('still answers the addresses when the chain cannot be asked', async () => {
    app = await createApp({
      probe: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:8545');
      },
    });

    const res = await request(app.getHttpServer()).get('/config').expect(200);

    expect(res.body.factoryAddress).toBe(FACTORY);
    expect(res.body.feeRegistryAddress).toBe(FEE_REGISTRY);
    expect(res.body.chainId).toBeNull();
    expect(res.body.chainIdProblem).toContain('pnpm contracts:fork:bsc');
  });
});
