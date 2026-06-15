import {
  Inject,
  Injectable,
  Logger,
  Optional,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, Log, formatUnits, getAddress } from 'ethers';
import { PrismaService } from '../database/prisma.service';
import { INDEXER_PROVIDER, IndexerProvider } from './indexer-provider';
import { PriceService } from '../portfolio/price.service';
import { RangePlanner, BlockRange } from './range-planner';
import {
  ALL_TOPICS,
  parseVaultLog,
  buildExecutionRows,
  buildVaultEventRows,
  ParsedVaultLog,
  ExecutionRowData,
  VaultEventRowData,
} from './event-mapper';
import { IndexerCursorStore } from './indexer-cursor.store';
import {
  EXECUTION_EVENTS_PORT,
  ExecutionEventsPort,
} from './execution-events.port';
import {
  PROTOCOL_FLOW_SOURCES,
  ProtocolFlowSource,
  LogSubscription,
  ProtocolFlowRow,
  buildProtocolFlowRows,
  vaultTopicFilter,
} from './protocol-flow';

const ERC20_DECIMALS_ABI = ['function decimals() external view returns (uint8)'];
const FEE_REGISTRY_ABI = ['function depositFeeBps() external view returns (uint16)'];

/**
 * In-process execution indexer (PEC-219, Path B).
 *
 * A self-rescheduling poll loop (run → await → setTimeout), guarded by an
 * in-flight flag, reads `AutomationExecuted` + `GasCompSettled` logs across ALL
 * vault proxies via a single address-less `getLogs`, gates them on the
 * per-tick-reloaded known-vault set, and persists idempotent SUCCESS rows. The
 * durable cursor lets it resume exactly where it left off after a restart.
 */
@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);

  private enabled = true;
  private confirmations = 5;
  private maxRange = 2000;
  private pollIntervalMs = 6000;
  private startBlockOverride: number | null = null;
  private feeRegistryAddress: string | null = null;

  private running = false;
  private inFlight = false;
  private timer: NodeJS.Timeout | null = null;

  /** Token → decimals, cached across ticks (immutable per token). */
  private readonly decimalsCache = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly priceService: PriceService,
    private readonly cursor: IndexerCursorStore,
    @Inject(EXECUTION_EVENTS_PORT)
    private readonly events: ExecutionEventsPort,
    @Inject(INDEXER_PROVIDER)
    private readonly provider: IndexerProvider | null,
    @Optional()
    @Inject(PROTOCOL_FLOW_SOURCES)
    private readonly flowSources: ProtocolFlowSource[] = [],
  ) {}

  /** Lazily-resolved adapter log subscriptions (slice #08), cached after first tick. */
  private flowSubs: LogSubscription[] | null = null;

  async onModuleInit(): Promise<void> {
    this.enabled = this.config.get('INDEXER_ENABLED', 'true') !== 'false';
    this.confirmations = Number(this.config.get('INDEXER_CONFIRMATIONS', 5));
    this.maxRange = Number(this.config.get('INDEXER_MAX_RANGE', 2000));
    this.pollIntervalMs = Number(this.config.get('INDEXER_POLL_INTERVAL_MS', 6000));
    const startEnv = this.config.get<string>('INDEXER_START_BLOCK');
    this.startBlockOverride = startEnv ? Number(startEnv) : null;
    this.feeRegistryAddress = this.config.get<string>('FEE_REGISTRY_ADDRESS') ?? null;

    if (!this.provider) {
      this.logger.warn('RPC provider unavailable (RPC_URL not set) — indexer disabled');
      this.enabled = false;
      return;
    }

    // The indexer is a background process — a startup hiccup (e.g. an
    // unreachable DB/RPC, or a mocked Prisma in integration tests) must never
    // crash the API. Failures here just leave the loop unstarted.
    try {
      await this.ensureCursorSeeded();
      if (this.enabled) {
        this.running = true;
        this.scheduleNext(0);
        this.logger.log(
          `Indexer started (confirmations=${this.confirmations}, maxRange=${this.maxRange}, poll=${this.pollIntervalMs}ms)`,
        );
      } else {
        this.logger.log('Indexer present but loop disabled (INDEXER_ENABLED=false)');
      }
    } catch (err) {
      this.logger.error(`Indexer failed to start: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.provider) await this.provider.destroy();
  }

  private requireProvider(): IndexerProvider {
    if (!this.provider) throw new Error('Indexer provider unavailable');
    return this.provider;
  }

  /** Seed the cursor once: env override, else min vault block, else head. */
  private async ensureCursorSeeded(): Promise<void> {
    const existing = await this.cursor.get();
    if (existing) return;

    let seed: number;
    if (this.startBlockOverride !== null) {
      seed = Math.max(0, this.startBlockOverride - 1);
    } else {
      const min = await this.prisma.vault.aggregate({
        _min: { createdAtBlock: true },
      });
      if (min._min.createdAtBlock != null) {
        seed = Math.max(0, min._min.createdAtBlock - 1);
      } else {
        seed = await this.requireProvider().getBlockNumber();
      }
    }
    await this.cursor.initIfMissing(seed);
    this.logger.log(`Indexer cursor seeded at block ${seed}`);
  }

  private scheduleNext(delay: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.runOnce().finally(() => this.scheduleNext(this.pollIntervalMs));
    }, delay);
  }

  private async runOnce(): Promise<void> {
    if (this.inFlight) return; // prevent overlap on slow RPC
    this.inFlight = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`Indexer tick failed: ${(err as Error).message}`);
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * One indexing pass. Exposed for integration tests, which drive it manually
   * (INDEXER_ENABLED=false disables the auto loop).
   */
  async tick(): Promise<void> {
    const head = await this.requireProvider().getBlockNumber();
    const cursor = await this.cursor.get();
    if (!cursor) {
      await this.ensureCursorSeeded();
      return;
    }

    const ranges = RangePlanner.plan(
      head,
      cursor.lastProcessedBlock,
      this.maxRange,
      this.confirmations,
    );
    if (ranges.length === 0) return;

    // Reload the known-vault set every tick (Story #20: no post-boot staleness).
    const vaults = await this.prisma.vault.findMany({
      select: { id: true, address: true },
    });
    const vaultByAddress = new Map<string, string>();
    for (const v of vaults) vaultByAddress.set(getAddress(v.address), v.id);

    for (const range of ranges) {
      const logs = await this.fetchLogs(range);
      const parsed = logs
        .map((l) => parseVaultLog(l))
        .filter((p): p is ParsedVaultLog => p !== null)
        // gate on known vaults (address-less filter may catch foreign logs)
        .filter((p) => vaultByAddress.has(p.address));

      if (parsed.length > 0) {
        const blockTimestamps = await this.resolveBlockTimestamps(parsed);

        const execRows = buildExecutionRows(parsed, blockTimestamps);
        await this.persist(execRows, vaultByAddress);

        const hasDeposit = parsed.some((p) => p.name === 'Deposited');
        const depositFeeBps = hasDeposit ? await this.readDepositFeeBps() : 0;
        const eventRows = buildVaultEventRows(parsed, blockTimestamps, depositFeeBps);
        await this.persistVaultEvents(eventRows, vaultByAddress);
      }

      // Adapter-declared protocol flows (slice #08). Guarded so a failure here
      // never breaks the proven execution/vault-event path or the cursor advance.
      await this.indexProtocolFlows(range, vaultByAddress);

      const toTs = await this.blockTimestamp(range.to);
      await this.cursor.advance(range.to, new Date(toTs * 1000));
    }
  }

  /** Resolve all flow-source subscriptions once (cached). */
  private async resolveFlowSubscriptions(): Promise<LogSubscription[]> {
    if (this.flowSubs) return this.flowSubs;
    const subs: LogSubscription[] = [];
    for (const src of this.flowSources ?? []) {
      try {
        subs.push(...(await src.logSubscriptions()));
      } catch (err) {
        this.logger.warn(
          `flow source subscription resolve failed: ${(err as Error).message}`,
        );
      }
    }
    this.flowSubs = subs;
    return subs;
  }

  /**
   * Index protocol flows (e.g. Aave Supply/Withdraw) for a block range, gated
   * server-side to known vaults via the subscription's vault topic. Generic — the
   * indexer has no protocol-specific knowledge; everything comes from the
   * adapter's subscription descriptor.
   */
  private async indexProtocolFlows(
    range: BlockRange,
    vaultByAddress: Map<string, string>,
  ): Promise<void> {
    try {
      const subs = await this.resolveFlowSubscriptions();
      if (subs.length === 0) return;
      const vaultAddrs = [...vaultByAddress.keys()];
      if (vaultAddrs.length === 0) return;

      for (const sub of subs) {
        const logs = await this.requireProvider().getLogs({
          address: sub.address,
          fromBlock: range.from,
          toBlock: range.to,
          topics: vaultTopicFilter(sub, vaultAddrs),
        });
        if (logs.length === 0) continue;

        const bts = new Map<number, number>();
        for (const bn of new Set(logs.map((l) => l.blockNumber))) {
          bts.set(bn, await this.blockTimestamp(bn));
        }
        const rows = buildProtocolFlowRows(
          sub,
          logs as unknown as Parameters<typeof buildProtocolFlowRows>[1],
          vaultByAddress,
          bts,
        );
        await this.persistProtocolFlows(rows, vaultByAddress);
      }
    } catch (err) {
      this.logger.warn(
        `protocol-flow indexing failed for ${range.from}-${range.to}: ${(err as Error).message}`,
      );
    }
  }

  /** Persist new protocol-flow rows idempotently on (txHash, logIndex), USD frozen. */
  private async persistProtocolFlows(
    rows: ProtocolFlowRow[],
    vaultByAddress: Map<string, string>,
  ): Promise<void> {
    if (rows.length === 0) return;
    const existing = await this.prisma.protocolFlow.findMany({
      where: { OR: rows.map((r) => ({ txHash: r.txHash, logIndex: r.logIndex })) },
      select: { txHash: true, logIndex: true },
    });
    const seen = new Set(existing.map((e) => `${e.txHash}:${e.logIndex}`));
    const newRows = rows.filter((r) => !seen.has(`${r.txHash}:${r.logIndex}`));
    if (newRows.length === 0) return;

    const usd = await this.computeUsd(
      newRows.map((r) => ({ token: r.token, amount: r.amount })),
    );

    await this.prisma.protocolFlow.createMany({
      data: newRows.map((r, i) => ({
        vaultId: vaultByAddress.get(r.vaultAddress)!,
        protocol: r.protocol,
        kind: r.kind,
        token: r.token,
        amount: r.amount,
        amountUsd: usd[i],
        txHash: r.txHash,
        blockNumber: r.blockNumber,
        logIndex: r.logIndex,
        blockTimestamp: r.blockTimestamp,
      })),
      skipDuplicates: true,
    });
  }

  /** getLogs with adaptive halving on a range-limit RPC rejection. */
  private async fetchLogs(range: BlockRange): Promise<Log[]> {
    try {
      return await this.requireProvider().getLogs({
        fromBlock: range.from,
        toBlock: range.to,
        topics: [ALL_TOPICS],
      });
    } catch (err) {
      if (range.to > range.from) {
        this.logger.warn(
          `getLogs ${range.from}-${range.to} failed (${(err as Error).message}); halving`,
        );
        const out: Log[] = [];
        for (const half of RangePlanner.halve(range)) {
          out.push(...(await this.fetchLogs(half)));
        }
        return out;
      }
      throw err;
    }
  }

  private async resolveBlockTimestamps(
    logs: ParsedVaultLog[],
  ): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    const distinct = [...new Set(logs.map((l) => l.blockNumber))];
    for (const bn of distinct) out.set(bn, await this.blockTimestamp(bn));
    return out;
  }

  private async blockTimestamp(block: number): Promise<number> {
    const b = await this.requireProvider().getBlock(block);
    if (!b) throw new Error(`Block ${block} not found`);
    return b.timestamp;
  }

  private async decimalsOf(token: string): Promise<number> {
    const key = getAddress(token);
    const cached = this.decimalsCache.get(key);
    if (cached !== undefined) return cached;
    try {
      const c = new Contract(key, ERC20_DECIMALS_ABI, this.requireProvider() as any);
      const d = Number(await c.decimals());
      this.decimalsCache.set(key, d);
      return d;
    } catch {
      this.decimalsCache.set(key, 18);
      return 18;
    }
  }

  /** Current deposit-fee rate, read fresh per tick (only when deposits seen). */
  private async readDepositFeeBps(): Promise<number> {
    if (!this.feeRegistryAddress) return 0;
    try {
      const reg = new Contract(
        this.feeRegistryAddress,
        FEE_REGISTRY_ABI,
        this.requireProvider() as any,
      );
      return Number(await reg.depositFeeBps());
    } catch {
      return 0;
    }
  }

  /** Persist new deposit/withdraw rows idempotently on (txHash, logIndex). */
  private async persistVaultEvents(
    rows: VaultEventRowData[],
    vaultByAddress: Map<string, string>,
  ): Promise<void> {
    if (rows.length === 0) return;
    const existing = await this.prisma.vaultEvent.findMany({
      where: { OR: rows.map((r) => ({ txHash: r.txHash, logIndex: r.logIndex })) },
      select: { txHash: true, logIndex: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.txHash}:${e.logIndex}`));
    const newRows = rows.filter(
      (r) => !existingKeys.has(`${r.txHash}:${r.logIndex}`),
    );
    if (newRows.length === 0) return;

    // Freeze the deposit/withdraw amount in USD (write time ≈ event-time price).
    const usdByRow = await this.computeUsd(
      newRows.map((r) => ({ token: r.token, amount: r.amount })),
    );

    await this.prisma.vaultEvent.createMany({
      data: newRows.map((r, i) => ({
        vaultId: vaultByAddress.get(r.vaultAddress)!,
        eventType: r.eventType,
        token: r.token,
        amount: r.amount,
        amountUsd: usdByRow[i],
        feeAmount: r.feeAmount,
        feeBps: r.feeBps,
        txHash: r.txHash,
        blockNumber: r.blockNumber,
        logIndex: r.logIndex,
        blockTimestamp: r.blockTimestamp,
      })),
      skipDuplicates: true,
    });
  }

  /** Persist new SUCCESS rows idempotently, enrich USD, emit the new ones. */
  private async persist(
    rows: ExecutionRowData[],
    vaultByAddress: Map<string, string>,
  ): Promise<void> {
    // which rows are genuinely new (idempotent on (txHash, logIndex))?
    const existing = await this.prisma.execution.findMany({
      where: { OR: rows.map((r) => ({ txHash: r.txHash, logIndex: r.logIndex })) },
      select: { txHash: true, logIndex: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.txHash}:${e.logIndex}`));
    const newRows = rows.filter(
      (r) => !existingKeys.has(`${r.txHash}:${r.logIndex}`),
    );
    if (newRows.length === 0) return;

    const usdByRow = await this.enrichUsd(newRows);

    // Distinct (vaultId, automationId) pairs whose open failure (if any) this
    // batch of successes resolves.
    const resolvePairs = [
      ...new Map(
        newRows.map((r) => {
          const vaultId = vaultByAddress.get(r.vaultAddress)!;
          return [`${vaultId}:${r.automationId}`, { vaultId, automationId: r.automationId }];
        }),
      ).values(),
    ];
    const resolvedAt = new Date();

    // Insert the SUCCESS rows AND resolve any matching open failures atomically
    // (cross-channel coupling, PEC-219 #05): no window where a success exists
    // while its failure is still open, or vice versa.
    await this.prisma.$transaction(async (tx) => {
      await tx.execution.createMany({
        data: newRows.map((r, i) => ({
          vaultId: vaultByAddress.get(r.vaultAddress)!,
          automationId: r.automationId,
          executorAddress: r.executorAddress,
          txHash: r.txHash,
          blockNumber: r.blockNumber,
          logIndex: r.logIndex,
          blockTimestamp: r.blockTimestamp,
          gasCompAmount: r.gasCompAmount,
          gasCompToken: r.gasCompToken,
          gasCompUsd: usdByRow[i],
        })),
        skipDuplicates: true,
      });

      for (const pair of resolvePairs) {
        await tx.executionFailure.updateMany({
          where: { vaultId: pair.vaultId, automationId: pair.automationId, resolvedAt: null },
          data: { resolvedAt },
        });
      }
    });

    // Emit the freshly-persisted rows per vault (no-op until slice #06).
    const created = await this.prisma.execution.findMany({
      where: {
        OR: newRows.map((r) => ({ txHash: r.txHash, logIndex: r.logIndex })),
      },
    });
    const byVaultId = new Map<string, typeof created>();
    for (const row of created) {
      const arr = byVaultId.get(row.vaultId) ?? [];
      arr.push(row);
      byVaultId.set(row.vaultId, arr);
    }
    for (const [vaultId, rowsForVault] of byVaultId) {
      const addr = [...vaultByAddress.entries()].find(
        ([, id]) => id === vaultId,
      )?.[0];
      if (addr) this.events.emitNewExecutions(addr, rowsForVault);
    }
  }

  /** Freeze gasCompUsd at write time (≈ execution-time price, ~15s lag). */
  private async enrichUsd(rows: ExecutionRowData[]): Promise<(string | null)[]> {
    return this.computeUsd(rows.map((r) => ({ token: r.gasCompToken, amount: r.gasCompAmount })));
  }

  /**
   * Frozen USD value for a parallel list of (token, base-unit amount) — batches
   * the price lookup and caches decimals. Used for both the execution gas-comp
   * USD and the deposit/withdraw amount USD. Null when the token/amount is
   * absent or no price is available.
   */
  private async computeUsd(
    items: { token: string | null; amount: string | null }[],
  ): Promise<(string | null)[]> {
    const tokens = [
      ...new Set(
        items.filter((i) => i.amount && i.token).map((i) => getAddress(i.token!)),
      ),
    ];
    if (tokens.length === 0) return items.map(() => null);

    const prices = await this.priceService.getPrices(tokens);
    const decimals = new Map<string, number>();
    for (const t of tokens) decimals.set(t, await this.decimalsOf(t));

    return items.map((i) => {
      if (!i.amount || !i.token) return null;
      const token = getAddress(i.token);
      const price = prices.get(token)?.priceUsd;
      if (price === undefined) return null;
      const human = Number(formatUnits(BigInt(i.amount), decimals.get(token)!));
      return (human * price).toString();
    });
  }
}
