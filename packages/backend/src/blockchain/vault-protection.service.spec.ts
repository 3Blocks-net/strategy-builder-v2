import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VaultProtectionService } from './vault-protection.service';
import { VaultCodeService } from './vault-code.service';

const VAULT = '0x1234567890123456789012345678901234567890';

const mockProvider = {
  destroy: jest.fn(),
};

const mockVault = {
  expertMode: jest.fn(),
};

const mockVaultCode = {
  hasCode: jest.fn(),
};

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    JsonRpcProvider: jest.fn(() => mockProvider),
    Contract: jest.fn(() => mockVault),
  };
});

describe('the protection status of a vault', () => {
  let service: VaultProtectionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockVaultCode.hasCode.mockResolvedValue(true);
    mockProvider.destroy.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultProtectionService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => (key === 'RPC_URL' ? 'http://rpc' : undefined) },
        },
        { provide: VaultCodeService, useValue: mockVaultCode },
      ],
    }).compile();

    service = module.get(VaultProtectionService);
  });

  it('reports the curated standard when the vault says it still checks targets', async () => {
    mockVault.expertMode.mockResolvedValue(false);

    const protection = await service.getProtection(VAULT);

    expect(protection.status).toBe('standard');
    expect(protection.checkedAt).not.toBeNull();
  });

  it('reports expert mode when the vault says the check is off', async () => {
    mockVault.expertMode.mockResolvedValue(true);

    const protection = await service.getProtection(VAULT);

    expect(protection.status).toBe('expert');
    expect(protection.checkedAt).not.toBeNull();
  });

  it('stamps the answer with the time it was actually read', async () => {
    mockVault.expertMode.mockResolvedValue(false);
    const before = Date.now();

    const protection = await service.getProtection(VAULT);

    const checkedAt = new Date(protection.checkedAt!).getTime();
    expect(checkedAt).toBeGreaterThanOrEqual(before);
    expect(checkedAt).toBeLessThanOrEqual(Date.now());
  });

  it('says unknown — never standard — when the read fails', async () => {
    mockVault.expertMode.mockRejectedValue(new Error('RPC down'));

    const protection = await service.getProtection(VAULT);

    expect(protection.status).toBe('unknown');
    expect(protection.checkedAt).toBeNull();
  });

  it('says unknown — and throws nothing — when the code check itself fails', async () => {
    // The code check sits outside the contract read, so its failure has to be
    // caught by this service rather than by whatever VaultCodeService happens
    // to do internally today.
    mockVaultCode.hasCode.mockRejectedValue(new Error('RPC unreachable'));

    await expect(service.getProtection(VAULT)).resolves.toEqual({
      status: 'unknown',
      checkedAt: null,
    });
  });

  it('keeps the answer it read when tearing the RPC connection down fails', async () => {
    mockVault.expertMode.mockResolvedValue(false);
    mockProvider.destroy.mockImplementation(() => {
      throw new Error('socket already gone');
    });

    // A failing teardown must not surface as a thrown request, and it must not
    // be dressed up as a protection claim either.
    await expect(service.getProtection(VAULT)).resolves.toEqual({
      status: 'standard',
      checkedAt: expect.any(String),
    });
  });

  it('says unknown when the vault is not on this chain', async () => {
    mockVaultCode.hasCode.mockResolvedValue(false);

    const protection = await service.getProtection(VAULT);

    expect(protection.status).toBe('unknown');
    expect(mockVault.expertMode).not.toHaveBeenCalled();
  });

  it('says unknown when the contract answers with something that is not a flag', async () => {
    // An older vault without `expertMode()` decodes to nothing useful. That is
    // not evidence of protection.
    mockVault.expertMode.mockResolvedValue(undefined);

    const protection = await service.getProtection(VAULT);

    expect(protection.status).toBe('unknown');
    expect(protection.checkedAt).toBeNull();
  });

  it('says unknown when there is no RPC endpoint to ask', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultProtectionService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: VaultCodeService, useValue: mockVaultCode },
      ],
    }).compile();

    const protection = await module
      .get(VaultProtectionService)
      .getProtection(VAULT);

    expect(protection.status).toBe('unknown');
  });

  it('asks the chain again for every call instead of trusting an earlier answer', async () => {
    mockVault.expertMode.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const first = await service.getProtection(VAULT);
    const second = await service.getProtection(VAULT);

    expect(first.status).toBe('standard');
    expect(second.status).toBe('expert');
  });
});
