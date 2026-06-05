import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/** The single logical feed name (one cursor advances all topics together). */
export const EXECUTIONS_FEED = 'executions';

/**
 * Prisma-backed read/advance of the indexer's durable `lastProcessedBlock`
 * (PEC-219). On boot the indexer resumes from `cursor + 1`; in-memory state is
 * never trusted.
 */
@Injectable()
export class IndexerCursorStore {
  constructor(private readonly prisma: PrismaService) {}

  /** Current cursor, or null if the feed has never been initialised. */
  async get(
    feed = EXECUTIONS_FEED,
  ): Promise<{ lastProcessedBlock: number; lastProcessedBlockTimestamp: Date | null } | null> {
    const row = await this.prisma.indexerCursor.findUnique({ where: { feed } });
    if (!row) return null;
    return {
      lastProcessedBlock: row.lastProcessedBlock,
      lastProcessedBlockTimestamp: row.lastProcessedBlockTimestamp,
    };
  }

  /** Seed the feed once at the given block (no-op if it already exists). */
  async initIfMissing(block: number, feed = EXECUTIONS_FEED): Promise<void> {
    await this.prisma.indexerCursor.upsert({
      where: { feed },
      create: { feed, lastProcessedBlock: block },
      update: {},
    });
  }

  /** Advance the cursor to `block` (with the block's timestamp, if known). */
  async advance(
    block: number,
    blockTimestamp: Date | null,
    feed = EXECUTIONS_FEED,
  ): Promise<void> {
    await this.prisma.indexerCursor.update({
      where: { feed },
      data: { lastProcessedBlock: block, lastProcessedBlockTimestamp: blockTimestamp },
    });
  }
}
