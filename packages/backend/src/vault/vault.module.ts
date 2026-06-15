import { Module } from '@nestjs/common';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { VaultOwnerGuard } from './vault-owner.guard';
import { VaultAccessService } from './vault-access.service';

@Module({
  controllers: [VaultController],
  providers: [VaultService, VaultOwnerGuard, VaultAccessService],
  exports: [VaultService, VaultOwnerGuard, VaultAccessService],
})
export class VaultModule {}
