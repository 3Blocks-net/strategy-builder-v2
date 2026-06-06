import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { VaultOwnerGuard } from '../vault/vault-owner.guard';
import { SnapshotService } from './snapshot.service';
import { HistoryService } from './history.service';
import { PerformanceService } from './performance.service';

@ApiTags('Cockpit')
@ApiBearerAuth()
@Controller('vaults')
export class CockpitController {
  constructor(
    private readonly snapshots: SnapshotService,
    private readonly history: HistoryService,
    private readonly performance: PerformanceService,
  ) {}

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
    description:
      '1 = recompute live (ephemeral); default serves the latest snapshot',
  })
  async getPositions(
    @Param('address') address: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.snapshots.getPositionsView(address, refresh === '1');
  }

  @Get(':address/value-history')
  @UseGuards(VaultOwnerGuard)
  @ApiOperation({
    summary: 'USD value-over-time series + deposit/withdraw markers',
  })
  @ApiParam({ name: 'address', description: 'Vault address' })
  @ApiQuery({
    name: 'range',
    required: false,
    description: '24h | 7d | 30d | all (default 30d)',
  })
  async getValueHistory(
    @Param('address') address: string,
    @Query('range') range = '30d',
  ) {
    return this.history.getValueHistory(address, range);
  }

  @Get(':address/performance')
  @UseGuards(VaultOwnerGuard)
  @ApiOperation({
    summary:
      'PnL vs net deposits + costs (fees + gas), flow-adjusted over the range',
  })
  @ApiParam({ name: 'address', description: 'Vault address' })
  @ApiQuery({
    name: 'range',
    required: false,
    description: '24h | 7d | 30d | all (default all)',
  })
  async getPerformance(
    @Param('address') address: string,
    @Query('range') range = 'all',
  ) {
    return this.performance.getPerformance(address, range);
  }
}
