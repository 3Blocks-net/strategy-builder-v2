import {
  DEPLOYMENT_ADDRESS_SPECS,
  DeploymentFile,
  DeploymentFileContent,
  PANCAKESWAP_V3_FACTORY_BSC,
  describeAddressSources,
  resolveDeploymentAddresses,
} from './deployment-addresses';

const FILE_PATH = '/repo/packages/contracts/deployments/fork-latest.json';
const FROM_FILE = '0x1111111111111111111111111111111111111111';
const FROM_ENV = '0x2222222222222222222222222222222222222222';

function fileWith(content: DeploymentFileContent): DeploymentFile & {
  load: jest.Mock<DeploymentFileContent, []>;
} {
  return { path: FILE_PATH, load: jest.fn(() => content) };
}

const deployOutput = fileWith({
  ok: true,
  addresses: {
    StrategyBuilderVaultFactory: FROM_FILE,
    FeeRegistry: FROM_FILE,
  },
});

function resolve(
  env: Record<string, string | undefined>,
  options: { isProduction?: boolean; file?: DeploymentFile } = {},
) {
  return resolveDeploymentAddresses({
    env,
    isProduction: options.isProduction ?? false,
    file: options.file ?? deployOutput,
  });
}

describe('deployment address resolution', () => {
  it('prefers the environment variable over the deploy output', () => {
    const factory = resolve({ FACTORY_ADDRESS: FROM_ENV }).factory;

    expect(factory).toEqual({
      ok: true,
      address: FROM_ENV,
      source: 'env FACTORY_ADDRESS',
    });
  });

  it('falls back to the deploy output outside production', () => {
    const factory = resolve({}).factory;

    expect(factory.ok && factory.address).toBe(FROM_FILE);
    expect(factory.ok && factory.source).toContain('fork-latest.json');
    expect(factory.ok && factory.source).toContain(
      'StrategyBuilderVaultFactory',
    );
  });

  it('never reads the deploy output in production', () => {
    const file = fileWith({
      ok: true,
      addresses: { StrategyBuilderVaultFactory: FROM_FILE },
    });

    const resolved = resolveDeploymentAddresses({
      env: {},
      isProduction: true,
      file,
    });

    expect(file.load).not.toHaveBeenCalled();
    expect(resolved.factory.ok).toBe(false);
    expect(!resolved.factory.ok && resolved.factory.problem).toContain(
      'FACTORY_ADDRESS is not set',
    );
    expect(!resolved.factory.ok && resolved.factory.problem).toContain(
      'never read',
    );
  });

  it('still honours the environment variable in production', () => {
    const file = fileWith({ ok: true, addresses: {} });

    const resolved = resolveDeploymentAddresses({
      env: { FACTORY_ADDRESS: FROM_ENV, FEE_REGISTRY_ADDRESS: FROM_ENV },
      isProduction: true,
      file,
    });

    expect(resolved.factory.ok && resolved.factory.address).toBe(FROM_ENV);
    expect(resolved.feeRegistry.ok && resolved.feeRegistry.address).toBe(
      FROM_ENV,
    );
    expect(file.load).not.toHaveBeenCalled();
  });

  it('reads the deploy output at most once for all addresses', () => {
    const file = fileWith({
      ok: true,
      addresses: {
        StrategyBuilderVaultFactory: FROM_FILE,
        FeeRegistry: FROM_FILE,
      },
    });

    resolveDeploymentAddresses({ env: {}, isProduction: false, file });

    expect(file.load).toHaveBeenCalledTimes(1);
  });

  describe('when the deploy output cannot be used', () => {
    it('names the file and the command when it is missing', () => {
      const file = fileWith({ ok: false, reason: 'the file does not exist' });

      const factory = resolve({}, { file }).factory;

      expect(factory.ok).toBe(false);
      expect(!factory.ok && factory.problem).toContain(FILE_PATH);
      expect(!factory.ok && factory.problem).toContain('does not exist');
      expect(!factory.ok && factory.problem).toContain(
        'pnpm contracts:deploy:fork',
      );
    });

    it('names the file and the command when it is broken', () => {
      const file = fileWith({
        ok: false,
        reason: 'it is not valid JSON (Unexpected end of JSON input)',
      });

      const factory = resolve({}, { file }).factory;

      expect(!factory.ok && factory.problem).toContain(FILE_PATH);
      expect(!factory.ok && factory.problem).toContain('not valid JSON');
      expect(!factory.ok && factory.problem).toContain(
        'pnpm contracts:deploy:fork',
      );
    });

    it('says which entry is missing', () => {
      const file = fileWith({ ok: true, addresses: { FeeRegistry: FROM_FILE } });

      const factory = resolve({}, { file }).factory;

      expect(!factory.ok && factory.problem).toContain(
        'no "StrategyBuilderVaultFactory" entry',
      );
    });

    it('rejects an entry that is not a contract address', () => {
      const file = fileWith({
        ok: true,
        addresses: { StrategyBuilderVaultFactory: '0xnope' },
      });

      const factory = resolve({}, { file }).factory;

      expect(!factory.ok && factory.problem).toContain(
        'is not a contract address',
      );
    });
  });

  it('rejects a malformed environment variable instead of silently using the file', () => {
    const factory = resolve({ FACTORY_ADDRESS: 'deadbeef' }).factory;

    expect(factory.ok).toBe(false);
    expect(!factory.ok && factory.problem).toContain(
      'FACTORY_ADDRESS is set but is not a contract address',
    );
  });

  describe('the PancakeSwap factory', () => {
    it('uses the live BSC address when nothing is configured', () => {
      const resolved = resolve({}).pancakeFactory;

      expect(resolved.ok && resolved.address).toBe(PANCAKESWAP_V3_FACTORY_BSC);
      expect(resolved.ok && resolved.source).toContain('built-in default');
    });

    it('is overridable and resolves in production too', () => {
      const file = fileWith({ ok: true, addresses: {} });

      const resolved = resolveDeploymentAddresses({
        env: { PCS_FACTORY_ADDRESS: FROM_ENV },
        isProduction: true,
        file,
      }).pancakeFactory;

      expect(resolved.ok && resolved.address).toBe(FROM_ENV);
    });
  });

  it('covers every address the backend asks for', () => {
    expect(Object.keys(DEPLOYMENT_ADDRESS_SPECS).sort()).toEqual([
      'factory',
      'feeRegistry',
      'pancakeFactory',
    ]);
  });

  it('describes the source of every address in one line', () => {
    const line = describeAddressSources(resolve({ FACTORY_ADDRESS: FROM_ENV }));

    expect(line).toContain('vault factory');
    expect(line).toContain('env FACTORY_ADDRESS');
    expect(line).toContain('fee registry');
    expect(line).toContain('PancakeSwap V3 factory');
  });
});
