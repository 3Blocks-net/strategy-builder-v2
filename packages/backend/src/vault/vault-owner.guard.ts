import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VaultAccessService } from './vault-access.service';

/**
 * Per-vault HTTP authorization. Delegates the ownership check to the shared
 * `VaultAccessService` (PEC-219 #06) so it can never drift from the WebSocket
 * gateway's check. Attaches the loaded vault to `req.vault`.
 */
@Injectable()
export class VaultOwnerGuard implements CanActivate {
  constructor(private readonly access: VaultAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userAddress: string | undefined = request.user?.address;
    const vaultAddress: string | undefined = request.params?.address;

    if (!vaultAddress) throw new NotFoundException('VAULT_NOT_FOUND');

    request.vault = await this.access.assertOwnership(vaultAddress, userAddress);
    return true;
  }
}
