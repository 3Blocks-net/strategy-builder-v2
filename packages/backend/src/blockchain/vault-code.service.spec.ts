import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VaultCodeService } from './vault-code.service';

const mockProvider = {
  getCode: jest.fn(),
  destroy: jest.fn(),
};

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return { ...actual, JsonRpcProvider: jest.fn(() => mockProvider) };
});

const VAULT = '0x1234567890123456789012345678901234567890';

function makeService() {
  const config = {
    get: jest.fn(() => 'http://localhost:8545'),
  } as unknown as ConfigService;
  return new VaultCodeService(config);
}

describe('VaultCodeService', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => warn.mockRestore());

  it('reports a deployed vault as present', async () => {
    mockProvider.getCode.mockResolvedValue('0x60806040');

    await expect(makeService().hasCode(VAULT)).resolves.toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns exactly once about a vault that has no code, however often it is asked', async () => {
    mockProvider.getCode.mockResolvedValue('0x');
    const service = makeService();

    expect(await service.hasCode(VAULT)).toBe(false);
    expect(await service.hasCode(VAULT)).toBe(false);
    expect(await service.hasCode(VAULT.toUpperCase())).toBe(false);

    // One line for the whole run — the point of the ticket. Repeating it per
    // request is what made the old message read like noise.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('does not exist on this chain');
    expect(mockProvider.getCode).toHaveBeenCalledTimes(1);
  });

  it('assumes a vault is present when the chain cannot be reached, and does not remember that', async () => {
    mockProvider.getCode.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const service = makeService();

    // An unreachable node is not evidence that a contract is gone; skipping a
    // real vault over a network hiccup would hide funds from its owner.
    expect(await service.hasCode(VAULT)).toBe(true);

    mockProvider.getCode.mockResolvedValue('0x60806040');
    expect(await service.hasCode(VAULT)).toBe(true);
    expect(mockProvider.getCode).toHaveBeenCalledTimes(2);
  });

  it('closes the connection it opened, even when the read fails', async () => {
    mockProvider.getCode.mockRejectedValue(new Error('boom'));

    await makeService().hasCode(VAULT);

    expect(mockProvider.destroy).toHaveBeenCalled();
  });
});
