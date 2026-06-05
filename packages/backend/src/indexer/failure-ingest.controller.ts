import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { KeeperIngestGuard } from './keeper-ingest.guard';
import { FailureIngestService, FailureIngestDto } from './failure-ingest.service';

/**
 * Keeper failure ingest (PEC-219 #05). `@Public()` bypasses the wallet
 * `APP_GUARD` (the keeper has no JWT); `KeeperIngestGuard` (shared secret) is the
 * sole gate. Reverts emit no logs, so this is the only path failures enter the
 * history.
 */
@ApiTags('Indexer')
@Controller('internal/executions')
export class FailureIngestController {
  constructor(private readonly ingest: FailureIngestService) {}

  @Post('failures')
  @Public()
  @UseGuards(KeeperIngestGuard)
  @ApiOperation({ summary: 'Keeper reports a failed execution (shared-secret auth)' })
  async reportFailure(@Body() dto: FailureIngestDto) {
    return this.ingest.ingest(dto);
  }
}
