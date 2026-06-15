import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IndexerCursorStore } from './indexer-cursor.store';

/**
 * Server-truth freshness for the frontend indicator (PEC-219).
 *
 * Global (the cursor is not vault-specific) and authenticated (protected by the
 * global wallet `APP_GUARD` — no `@Public()`). It exposes only a block number +
 * timestamp, letting the UI show real indexer lag rather than a client-side
 * last-fetch guess.
 */
@ApiTags('Indexer')
@ApiBearerAuth()
@Controller('indexer')
export class IndexerStatusController {
  constructor(private readonly cursor: IndexerCursorStore) {}

  @Get('status')
  @ApiOperation({ summary: 'Indexer cursor head (freshness)' })
  async status() {
    const c = await this.cursor.get();
    return {
      lastProcessedBlock: c?.lastProcessedBlock ?? null,
      lastProcessedBlockTimestamp: c?.lastProcessedBlockTimestamp ?? null,
    };
  }
}
