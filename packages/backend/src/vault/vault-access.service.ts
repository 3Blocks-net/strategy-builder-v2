import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Vault } from '@prisma/client';
import { getAddress } from 'ethers';
import { PrismaService } from '../database/prisma.service';

/**
 * Single source of truth for per-vault ownership (PEC-219 #06).
 *
 * Used by BOTH `VaultOwnerGuard` (HTTP) and the WebSocket gateway so the
 * no-data-leak boundary can never drift between the two transports. Addresses
 * are compared checksummed (`getAddress`) — the codebase convention — so casing
 * differences never cause a false allow/deny; malformed input is a clean
 * `NOT_FOUND` rather than a 500.
 */
@Injectable()
export class VaultAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOwnership(
    vaultAddress: string | undefined,
    userAddress: string | undefined,
  ): Promise<Vault> {
    let normalizedVault: string;
    let normalizedUser: string;
    try {
      normalizedVault = getAddress(vaultAddress ?? '');
      normalizedUser = getAddress(userAddress ?? '');
    } catch {
      throw new NotFoundException('VAULT_NOT_FOUND');
    }

    const vault = await this.prisma.vault.findUnique({
      where: { address: normalizedVault },
    });
    if (!vault) throw new NotFoundException('VAULT_NOT_FOUND');

    if (getAddress(vault.ownerAddress) !== normalizedUser) {
      throw new ForbiddenException('NOT_VAULT_OWNER');
    }
    return vault;
  }
}
