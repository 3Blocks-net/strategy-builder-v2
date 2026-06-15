import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SnapshotService } from './snapshot.service';
import {
  BoundaryEvent,
  computeRangePnl,
  feesUsd,
  netDepositsUsd,
} from './performance';
import {
  HistoryRange,
  VALID_RANGES,
  isHistoryRange,
  rangeToCutoff,
} from './history';

export interface VaultPerformance {
  currentValueUsd: number;
  netDepositsUsd: number;
  pnlAbsUsd: number;
  pnlPct: number | null;
  costsUsd: number;
}

/**
 * Performance / PnL read model (slice #06, all-time).
 *
 * `currentValue` comes from the same positions read model as the header (the
 * snapshot, or a live cold-start), so the numbers agree. Net deposits + fees read
 * **only** `VaultEvent` (boundary); gas reads `Execution.gasCompUsd`. ProtocolFlow
 * is never touched — the firewall that keeps protocol flows out of PnL.
 *
 * Legacy events with a null frozen `amountUsd` are skipped here (a PriceService
 * historical backfill is the documented follow-up); current events always freeze
 * USD at write time (PEC-219).
 */
@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: SnapshotService,
  ) {}

  async getPerformance(
    address: string,
    rangeInput = 'all',
  ): Promise<VaultPerformance> {
    if (!isHistoryRange(rangeInput)) {
      throw new BadRequestException(
        `range must be one of ${VALID_RANGES.join(', ')}`,
      );
    }
    const range: HistoryRange = rangeInput;

    const view = await this.snapshots.getPositionsView(address, false);
    const currentValueUsd = view.totalValueUsd;

    const vault = await this.prisma.vault.findUnique({
      where: { address },
      select: { id: true },
    });
    if (!vault) {
      return {
        currentValueUsd,
        netDepositsUsd: 0,
        pnlAbsUsd: currentValueUsd,
        pnlPct: null,
        costsUsd: 0,
      };
    }

    const cutoff = rangeToCutoff(range, new Date());

    // Baseline value at the range start = snapshot at/just before the cutoff.
    // None (or 'all') → 0, which makes the formula reduce to all-time PnL.
    let valueAtRangeStartUsd = 0;
    if (cutoff) {
      const baseline = await this.prisma.vaultValueSnapshot.findFirst({
        where: { vaultId: vault.id, asOf: { lte: cutoff } },
        orderBy: { asOf: 'desc' },
        select: { totalValueUsd: true },
      });
      if (baseline) valueAtRangeStartUsd = Number(baseline.totalValueUsd);
    }

    const timeFilter = cutoff ? { gte: cutoff } : undefined;
    const [rawEvents, executions] = await Promise.all([
      this.prisma.vaultEvent.findMany({
        where: {
          vaultId: vault.id,
          eventType: { in: ['DEPOSIT', 'WITHDRAW'] },
          ...(timeFilter ? { blockTimestamp: timeFilter } : {}),
        },
        select: { eventType: true, amountUsd: true, feeBps: true },
      }),
      this.prisma.execution.findMany({
        where: {
          vaultId: vault.id,
          gasCompUsd: { not: null },
          ...(timeFilter ? { blockTimestamp: timeFilter } : {}),
        },
        select: { gasCompUsd: true },
      }),
    ]);

    const events: BoundaryEvent[] = rawEvents.map((e) => ({
      eventType: e.eventType,
      amountUsd: e.amountUsd != null ? Number(e.amountUsd) : null,
      feeBps: e.feeBps,
    }));

    const netDeposits = netDepositsUsd(events);
    const gasUsd = executions.reduce(
      (sum, x) => sum + (x.gasCompUsd != null ? Number(x.gasCompUsd) : 0),
      0,
    );
    const costsUsd = feesUsd(events) + gasUsd;

    const { pnlAbsUsd, pnlPct } = computeRangePnl(
      currentValueUsd,
      valueAtRangeStartUsd,
      netDeposits,
    );

    return {
      currentValueUsd,
      netDepositsUsd: netDeposits,
      pnlAbsUsd,
      pnlPct,
      costsUsd,
    };
  }
}
