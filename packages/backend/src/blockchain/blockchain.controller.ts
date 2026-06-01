import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { FeeService } from './fee.service';
import { ContractErrorService } from './contract-error.service';

@Public()
@Controller()
export class BlockchainController {
  constructor(
    private readonly feeService: FeeService,
    private readonly contractErrorService: ContractErrorService,
  ) {}

  @Get('fees')
  async getFees() {
    return this.feeService.getFees();
  }

  @Get('tokens/accepted')
  async getAcceptedTokens() {
    const tokens = await this.feeService.getAcceptedTokens();
    return { tokens };
  }

  @Get('errors/contract-errors')
  getContractErrors() {
    return { errors: this.contractErrorService.getErrors() };
  }
}
