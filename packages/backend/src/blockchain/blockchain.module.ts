import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { DeploymentModule } from '../deployment/deployment.module';
import { BlockchainController } from './blockchain.controller';
import { VaultGasDepositController } from './vault-gas-deposit.controller';
import { FeeService } from './fee.service';
import { ContractErrorService } from './contract-error.service';
import { VaultCodeService } from './vault-code.service';
import { VaultProtectionService } from './vault-protection.service';

@Module({
  imports: [VaultModule, DeploymentModule],
  controllers: [BlockchainController, VaultGasDepositController],
  providers: [
    FeeService,
    ContractErrorService,
    VaultCodeService,
    VaultProtectionService,
  ],
  exports: [
    FeeService,
    ContractErrorService,
    VaultCodeService,
    VaultProtectionService,
  ],
})
export class BlockchainModule {}
