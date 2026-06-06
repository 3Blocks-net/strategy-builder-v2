import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { VaultOwnerGuard } from '../vault/vault-owner.guard';
import { ValuationService } from './valuation.service';

@ApiTags('Cockpit')
@ApiBearerAuth()
@Controller('vaults')
export class CockpitController {
  constructor(private readonly valuation: ValuationService) {}

  @Get(':address/positions')
  @UseGuards(VaultOwnerGuard)
  @ApiOperation({
    summary:
      'Unified, USD-valued vault positions (idle + gas reserve + protocol adapters), net equity',
  })
  @ApiParam({ name: 'address', description: 'Vault address' })
  @ApiQuery({
    name: 'refresh',
    required: false,
    description: '1 = bypass cache and recompute live',
  })
  async getPositions(
    @Param('address') address: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.valuation.valueVault(address, { refresh: refresh === '1' });
  }
}
