import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { BlockchainController } from './blockchain.controller';
import { VaultGasDepositController } from './vault-gas-deposit.controller';
import { FeeService } from './fee.service';
import { ContractErrorService } from './contract-error.service';
import { VaultCodeService } from './vault-code.service';

@Module({
  imports: [VaultModule],
  controllers: [BlockchainController, VaultGasDepositController],
  providers: [FeeService, ContractErrorService, VaultCodeService],
  exports: [FeeService, ContractErrorService, VaultCodeService],
})
export class BlockchainModule {}
