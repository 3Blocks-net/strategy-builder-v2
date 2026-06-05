import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getAddress } from 'ethers';
import { VaultAccessService } from './vault-access.service';

const OWNER = getAddress('0x1111111111111111111111111111111111111111');
const OTHER = getAddress('0x2222222222222222222222222222222222222222');
const VAULT = getAddress('0x3333333333333333333333333333333333333333');

function makePrisma(vault: any) {
  return {
    vault: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.address === VAULT ? vault : null,
      ),
    },
  } as any;
}

describe('VaultAccessService', () => {
  it('returns the vault when the caller owns it (checksummed match)', async () => {
    const svc = new VaultAccessService(makePrisma({ address: VAULT, ownerAddress: OWNER }));
    const v = await svc.assertOwnership(VAULT, OWNER);
    expect(v.address).toBe(VAULT);
  });

  it('matches regardless of input casing', async () => {
    const svc = new VaultAccessService(makePrisma({ address: VAULT, ownerAddress: OWNER }));
    await expect(svc.assertOwnership(VAULT.toLowerCase(), OWNER.toLowerCase())).resolves.toBeTruthy();
  });

  it('forbids a non-owner', async () => {
    const svc = new VaultAccessService(makePrisma({ address: VAULT, ownerAddress: OWNER }));
    await expect(svc.assertOwnership(VAULT, OTHER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('not-found for an unknown vault', async () => {
    const svc = new VaultAccessService(makePrisma({ address: VAULT, ownerAddress: OWNER }));
    await expect(
      svc.assertOwnership(getAddress('0x4444444444444444444444444444444444444444'), OWNER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('malformed input is NOT_FOUND, never a 500', async () => {
    const svc = new VaultAccessService(makePrisma({ address: VAULT, ownerAddress: OWNER }));
    await expect(svc.assertOwnership('not-an-address', OWNER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.assertOwnership(undefined, undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
