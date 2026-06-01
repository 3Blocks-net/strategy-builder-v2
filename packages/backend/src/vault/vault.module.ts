import { Module } from '@nestjs/common';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { VaultOwnerGuard } from './vault-owner.guard';

@Module({
  controllers: [VaultController],
  providers: [VaultService, VaultOwnerGuard],
  exports: [VaultService, VaultOwnerGuard],
})
export class VaultModule {}
