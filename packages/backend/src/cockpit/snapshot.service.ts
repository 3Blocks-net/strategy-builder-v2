import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { ValuationService } from './valuation.service';
import { ValuedVault } from './protocol-adapter';
import { mapWithConcurrency } from './concurrency';

/** DI token for the snapshot loop's own RPC provider (null → dormant). */
export const SNAPSHOT_PROVIDER = Symbol('SNAPSHOT_PROVIDER');

/** Minimal provider surface the snapshot loop needs. */
export interface SnapshotProvider {
  getBlockNumber(): Promise<number>;
  destroy?(): Promise<void> | void;
}

/** The positions read model returned to the controller. */
export interface PositionsView extends ValuedVault {
  source: 'snapshot' | 'live';
}

/**
 * Pick the snapshot loop's RPC endpoint: its own dedicated one when set, else
 * the shared `RPC_URL`, else null (→ dormant). Pure, so it's unit-testable.
 */
export function resolveSnapshotRpcUrl(
  snapshotUrl: string | undefined,
  rpcUrl: string | undefined,
): string | null {
  return snapshotUrl ?? rpcUrl ?? null;
}

const DAY_MS = 86_400_000;

/**
 * Vault-Cockpit snapshot loop (slice #04).
 *
 * A self-rescheduling `setTimeout` loop (same shape as IndexerService:
 * in-flight-guarded, resilient `onModuleInit`, dormant when no provider). Each
 * tick stamps the head block, values every known vault through `ValuationService`
 * at bounded concurrency, persists one `VaultValueSnapshot` each, and prunes rows
 * past the retention window. Also owns the positions read model: serve the latest
 * snapshot by default, recompute live on `refresh`, fall back to a live ephemeral
 * valuation on cold start.
 */
@Injectable()
export class SnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SnapshotService.name);

  private enabled = true;
  private intervalMs = 60 * 60 * 1000; // hourly
  private concurrency = 4;
  private retentionDays = 90;
  private running = false;
  private inFlight = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly valuation: ValuationService,
    @Inject(SNAPSHOT_PROVIDER)
    private readonly provider: SnapshotProvider | null,
  ) {}

  onModuleInit(): void {
    this.enabled = this.config.get('SNAPSHOT_ENABLED', 'true') !== 'false';
    this.intervalMs = Number(
      this.config.get('SNAPSHOT_INTERVAL_MS', 60 * 60 * 1000),
    );
    this.concurrency = Number(this.config.get('SNAPSHOT_CONCURRENCY', 4));
    this.retentionDays = Number(this.config.get('SNAPSHOT_RETENTION_DAYS', 90));

    if (!this.provider) {
      this.logger.warn(
        'No snapshot RPC provider (SNAPSHOT_RPC_URL / RPC_URL unset) — snapshot loop dormant',
      );
      this.enabled = false;
      return;
    }
    if (!this.enabled) {
      this.logger.log('Snapshot loop disabled (SNAPSHOT_ENABLED=false)');
      return;
    }

    // A background loop must never crash the API on a startup hiccup.
    try {
      this.running = true;
      this.scheduleNext(this.intervalMs);
      this.logger.log(
        `Snapshot loop started (interval=${this.intervalMs}ms, concurrency=${this.concurrency}, retention=${this.retentionDays}d)`,
      );
    } catch (err) {
      this.logger.error(`Snapshot loop failed to start: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.provider?.destroy) await this.provider.destroy();
  }

  private scheduleNext(delay: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.runOnce().finally(() => this.scheduleNext(this.intervalMs));
    }, delay);
  }

  private async runOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`Snapshot tick failed: ${(err as Error).message}`);
    } finally {
      this.inFlight = false;
    }
  }

  /** One snapshot pass over all known vaults. Exposed for tests. */
  async tick(): Promise<void> {
    const blockNumber = await this.headBlock();
    const vaults = await this.prisma.vault.findMany({
      select: { id: true, address: true },
    });

    await mapWithConcurrency(vaults, this.concurrency, async (vault) => {
      try {
        const valued = await this.valuation.valueVault(vault.address, {
          refresh: true,
        });
        await this.prisma.vaultValueSnapshot.create({
          data: {
            vaultId: vault.id,
            blockNumber,
            asOf: new Date(),
            totalValueUsd: valued.totalValueUsd.toString(),
            breakdown: valued.positions as object,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Snapshot failed for vault ${vault.address}: ${(err as Error).message}`,
        );
      }
    });

    await this.prune();
  }

  /** Delete snapshots older than the retention window. */
  private async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * DAY_MS);
    await this.prisma.vaultValueSnapshot.deleteMany({
      where: { asOf: { lt: cutoff } },
    });
  }

  private async headBlock(): Promise<number | null> {
    try {
      return this.provider ? await this.provider.getBlockNumber() : null;
    } catch {
      return null;
    }
  }

  /**
   * Positions read model. Default: latest snapshot. `refresh`: live recompute
   * (not persisted). Cold start (no snapshot): live ephemeral valuation.
   */
  async getPositionsView(
    address: string,
    refresh: boolean,
  ): Promise<PositionsView> {
    if (refresh) {
      const v = await this.valuation.valueVault(address, { refresh: true });
      return { ...v, source: 'live' };
    }

    const vault = await this.prisma.vault.findUnique({
      where: { address },
      select: { id: true },
    });
    if (vault) {
      const snap = await this.prisma.vaultValueSnapshot.findFirst({
        where: { vaultId: vault.id },
        orderBy: { asOf: 'desc' },
      });
      if (snap) {
        return {
          vaultAddress: address,
          positions: snap.breakdown as unknown as ValuedVault['positions'],
          totalValueUsd: Number(snap.totalValueUsd),
          asOfBlock: snap.blockNumber,
          asOf: snap.asOf.toISOString(),
          source: 'snapshot',
        };
      }
    }

    // Cold start — no snapshot yet; compute live (ephemeral) so the page isn't empty.
    const v = await this.valuation.valueVault(address, { refresh: false });
    return { ...v, source: 'live' };
  }
}
