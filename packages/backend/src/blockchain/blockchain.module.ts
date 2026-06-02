import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { BlockchainController } from './blockchain.controller';
import { VaultGasDepositController } from './vault-gas-deposit.controller';
import { FeeService } from './fee.service';
import { ContractErrorService } from './contract-error.service';

@Module({
  imports: [VaultModule],
  controllers: [BlockchainController, VaultGasDepositController],
  providers: [FeeService, ContractErrorService],
  exports: [FeeService, ContractErrorService],
})
export class BlockchainModule {}
