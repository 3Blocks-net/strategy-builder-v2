import { Module } from '@nestjs/common';
import { DeploymentModule } from '../deployment/deployment.module';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { VaultOwnerGuard } from './vault-owner.guard';
import { VaultAccessService } from './vault-access.service';

@Module({
  imports: [DeploymentModule],
  controllers: [VaultController],
  providers: [VaultService, VaultOwnerGuard, VaultAccessService],
  exports: [VaultService, VaultOwnerGuard, VaultAccessService],
})
export class VaultModule {}
