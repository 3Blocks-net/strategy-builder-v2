import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class VaultOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userAddress: string | undefined = request.user?.address;
    const vaultAddress: string | undefined = request.params?.address;

    if (!vaultAddress) {
      throw new NotFoundException('VAULT_NOT_FOUND');
    }

    const vault = await this.prisma.vault.findUnique({
      where: { address: vaultAddress },
    });

    if (!vault) {
      throw new NotFoundException('VAULT_NOT_FOUND');
    }

    if (vault.ownerAddress !== userAddress) {
      throw new ForbiddenException('NOT_VAULT_OWNER');
    }

    request.vault = vault;
    return true;
  }
}
