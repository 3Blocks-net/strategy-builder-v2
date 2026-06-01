import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { FeeService } from './fee.service';
import { ContractErrorService } from './contract-error.service';

@ApiTags('Blockchain')
@Public()
@Controller()
export class BlockchainController {
  constructor(
    private readonly feeService: FeeService,
    private readonly contractErrorService: ContractErrorService,
  ) {}

  @Get('fees')
  @ApiOperation({ summary: 'Get deposit and withdraw fee rates (BPS)' })
  async getFees() {
    return this.feeService.getFees();
  }

  @Get('tokens/accepted')
  @ApiOperation({ summary: 'Get accepted tokens with metadata' })
  async getAcceptedTokens() {
    const tokens = await this.feeService.getAcceptedTokens();
    return { tokens };
  }

  @Get('errors/contract-errors')
  @ApiOperation({ summary: 'Get Solidity custom error → message mapping' })
  getContractErrors() {
    return { errors: this.contractErrorService.getErrors() };
  }
}
