import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SnapshotService } from './snapshot.service';
import {
  BoundaryEvent,
  computePnl,
  feesUsd,
  netDepositsUsd,
} from './performance';

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

  async getPerformance(address: string): Promise<VaultPerformance> {
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

    const [rawEvents, executions] = await Promise.all([
      this.prisma.vaultEvent.findMany({
        where: { vaultId: vault.id, eventType: { in: ['DEPOSIT', 'WITHDRAW'] } },
        select: { eventType: true, amountUsd: true, feeBps: true },
      }),
      this.prisma.execution.findMany({
        where: { vaultId: vault.id, gasCompUsd: { not: null } },
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

    const { pnlAbsUsd, pnlPct } = computePnl(currentValueUsd, netDeposits);

    return {
      currentValueUsd,
      netDepositsUsd: netDeposits,
      pnlAbsUsd,
      pnlPct,
      costsUsd,
    };
  }
}
