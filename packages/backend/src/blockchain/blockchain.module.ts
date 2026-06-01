import { Module } from '@nestjs/common';
import { BlockchainController } from './blockchain.controller';
import { FeeService } from './fee.service';
import { ContractErrorService } from './contract-error.service';

@Module({
  controllers: [BlockchainController],
  providers: [FeeService, ContractErrorService],
  exports: [FeeService, ContractErrorService],
})
export class BlockchainModule {}
