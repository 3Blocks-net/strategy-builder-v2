import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChainIdProbe } from './chain-id.probe';
import { DeploymentFile } from './deployment-addresses';
import { DeploymentService } from './deployment.service';

const FILE_PATH = '/repo/packages/contracts/deployments/fork-latest.json';
const FACTORY = '0x1111111111111111111111111111111111111111';
const FEE_REGISTRY = '0x2222222222222222222222222222222222222222';
const REDEPLOYED_FACTORY = '0x3333333333333333333333333333333333333333';

function configOf(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function deployOutput(
  addresses: Record<string, unknown> = {
    StrategyBuilderVaultFactory: FACTORY,
    FeeRegistry: FEE_REGISTRY,
  },
): DeploymentFile {
  return { path: FILE_PATH, load: () => ({ ok: true, addresses }) };
}

/**
 * A deploy output that can be rewritten mid-test, the way a redeploy rewrites
 * the real one — including the timestamp the service watches.
 */
function redeployableOutput(addresses: Record<string, unknown>) {
  let current = addresses;
  let stamp = 'first';
  const load = jest.fn(() => ({ ok: true as const, addresses: current }));
  return {
    file: { path: FILE_PATH, load, stamp: () => stamp } as DeploymentFile,
    load,
    redeploy(next: Record<string, unknown>) {
      current = next;
      stamp = `${stamp}+`;
    },
  };
}

const missingFile: DeploymentFile = {
  path: FILE_PATH,
  load: () => ({ ok: false, reason: 'the file does not exist' }),
};

const unusedProbe: ChainIdProbe = () => {
  throw new Error('chain id must not be probed here');
};

function build(
  env: Record<string, string | undefined>,
  options: { file?: DeploymentFile; probe?: ChainIdProbe } = {},
): DeploymentService {
  return new DeploymentService(
    configOf(env),
    options.file ?? deployOutput(),
    options.probe ?? unusedProbe,
  );
}

describe('DeploymentService', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves the address the deploy output holds', () => {
    const service = build({});

    expect(service.getAddress('factory')).toBe(FACTORY);
    expect(service.getAddress('feeRegistry')).toBe(FEE_REGISTRY);
  });

  it('logs the source once, not on every lookup', () => {
    const service = build({});
    service.getAddress('factory');
    service.getAddress('factory');
    service.getAddress('feeRegistry');

    const sourceLines = logged.filter((line) =>
      line.includes('Deployment addresses'),
    );
    expect(sourceLines).toHaveLength(1);
    expect(sourceLines[0]).toContain(FILE_PATH);
  });

  it('names the fix when the address is unknown, without the server path', () => {
    const errors: string[] = [];
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => {
        errors.push(String(message));
      });
    const service = build({}, { file: missingFile });

    expect(() => service.getAddress('factory')).toThrow(
      ServiceUnavailableException,
    );
    try {
      service.getAddress('factory');
    } catch (err) {
      const message = (err as Error).message;
      // The answer can leave the machine (GET /config needs no login), so it
      // says what to run without describing where this server keeps its files.
      expect(message).not.toContain(FILE_PATH);
      expect(message).toContain(
        'packages/contracts/deployments/fork-latest.json',
      );
      expect(message).toContain('pnpm contracts:deploy:fork');
    }
    // The full path is not lost — it is written where it belongs.
    expect(errors.join('\n')).toContain(FILE_PATH);
  });

  describe('after a redeploy', () => {
    it('serves the new address without a restart', () => {
      const output = redeployableOutput({
        StrategyBuilderVaultFactory: FACTORY,
        FeeRegistry: FEE_REGISTRY,
      });
      const service = build({}, { file: output.file });
      expect(service.getAddress('factory')).toBe(FACTORY);

      output.redeploy({
        StrategyBuilderVaultFactory: REDEPLOYED_FACTORY,
        FeeRegistry: FEE_REGISTRY,
      });

      expect(service.getAddress('factory')).toBe(REDEPLOYED_FACTORY);
    });

    it('reads the file again only when it actually changed', () => {
      const output = redeployableOutput({
        StrategyBuilderVaultFactory: FACTORY,
        FeeRegistry: FEE_REGISTRY,
      });
      const service = build({}, { file: output.file });
      output.load.mockClear();

      service.getAddress('factory');
      service.getAddress('feeRegistry');
      service.tryGetAddress('factory');

      expect(output.load).not.toHaveBeenCalled();
    });

    it('says once more where the addresses now come from', () => {
      const output = redeployableOutput({
        StrategyBuilderVaultFactory: FACTORY,
        FeeRegistry: FEE_REGISTRY,
      });
      const service = build({}, { file: output.file });
      output.redeploy({
        StrategyBuilderVaultFactory: REDEPLOYED_FACTORY,
        FeeRegistry: FEE_REGISTRY,
      });
      service.getAddress('factory');

      const sourceLines = logged.filter((line) =>
        line.includes('Deployment addresses'),
      );
      expect(sourceLines).toHaveLength(2);
      expect(sourceLines[1]).toContain(REDEPLOYED_FACTORY);
    });
  });

  it('offers a non-throwing lookup for callers that stay dormant', () => {
    const service = build({}, { file: missingFile });

    expect(service.tryGetAddress('factory')).toBeNull();
    expect(service.describeProblem('factory')).toContain(FILE_PATH);
    expect(service.describeProblem('pancakeFactory')).toBeNull();
  });

  describe('in production', () => {
    it('refuses to start when a required address is missing', () => {
      expect(() =>
        build({ NODE_ENV: 'production' }, { file: deployOutput() }),
      ).toThrow(/FACTORY_ADDRESS is not set/);
    });

    it('never looks at the deploy output again, changed or not', () => {
      const output = redeployableOutput({
        StrategyBuilderVaultFactory: FACTORY,
        FeeRegistry: FEE_REGISTRY,
      });
      const service = build(
        {
          NODE_ENV: 'production',
          FACTORY_ADDRESS: FACTORY,
          FEE_REGISTRY_ADDRESS: FEE_REGISTRY,
        },
        { file: output.file },
      );
      output.redeploy({
        StrategyBuilderVaultFactory: REDEPLOYED_FACTORY,
        FeeRegistry: FEE_REGISTRY,
      });

      expect(service.getAddress('factory')).toBe(FACTORY);
      expect(output.load).not.toHaveBeenCalled();
    });

    it('starts when every address is configured explicitly', () => {
      const service = build(
        {
          NODE_ENV: 'production',
          FACTORY_ADDRESS: FACTORY,
          FEE_REGISTRY_ADDRESS: FEE_REGISTRY,
        },
        { file: deployOutput() },
      );

      expect(service.getAddress('factory')).toBe(FACTORY);
    });
  });

  describe('chain id', () => {
    it('reads it from the chain and caches the answer', async () => {
      const probe = jest.fn<Promise<number>, [string]>().mockResolvedValue(56);
      const service = build({ RPC_URL: 'http://localhost:8545' }, { probe });

      await expect(service.getChainId()).resolves.toBe(56);
      await expect(service.getChainId()).resolves.toBe(56);
      expect(probe).toHaveBeenCalledTimes(1);
      expect(probe).toHaveBeenCalledWith('http://localhost:8545');
    });

    it('lets CHAIN_ID win over the chain', async () => {
      const probe = jest.fn<Promise<number>, [string]>().mockResolvedValue(56);
      const service = build(
        { CHAIN_ID: '97', RPC_URL: 'http://localhost:8545' },
        { probe },
      );

      await expect(service.getChainId()).resolves.toBe(97);
      expect(probe).not.toHaveBeenCalled();
    });

    it('says how to fix an unreachable chain, and retries afterwards', async () => {
      const probe = jest
        .fn<Promise<number>, [string]>()
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
        .mockResolvedValue(31337);
      const service = build({ RPC_URL: 'http://localhost:8545' }, { probe });

      await expect(service.getChainId()).rejects.toThrow(
        /pnpm contracts:fork:bsc/,
      );
      await expect(service.getChainId()).resolves.toBe(31337);
    });

    it('says what is missing when there is nothing to ask', async () => {
      const service = build({});

      await expect(service.getChainId()).rejects.toThrow(/RPC_URL/);
    });
  });
});
