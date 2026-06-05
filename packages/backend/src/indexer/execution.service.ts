import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** A unified history row — a success execution, a deposit/withdraw, or a failure. */
export interface UnifiedHistoryRow {
  kind: 'execution' | 'vault_event' | 'failure';
  id: string;
  txHash: string | null;
  blockNumber: number;
  logIndex: number;
  blockTimestamp: Date; // sort key (failures use firstFailedAt for a stable position)
  // execution / failure
  automationId: number | null;
  executorAddress: string | null;
  // execution-only
  gasCompAmount: string | null;
  gasCompToken: string | null;
  gasCompUsd: string | null;
  // vault-event-only
  eventType: string | null;
  token: string | null;
  amount: string | null;
  amountUsd: string | null;
  feeAmount: string | null;
  feeBps: number | null;
  // failure-only
  failureStatus: string | null; // 'open' | 'resolved'
  errorMessage: string | null;
  attemptCount: number | null;
  firstFailedAt: Date | null;
  lastFailedAt: Date | null;
  resolvedAt: Date | null;
}

export interface ExecutionPage {
  rows: UnifiedHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Read-side of the unified vault history (PEC-219 #04 + #05).
 *
 * A raw `UNION` projected to one row shape:
 * - vault-wide  = `Execution` (successes) + `VaultEvent` (deposits/withdraws) + `ExecutionFailure`
 * - filtered by `automationId` = `Execution` + `ExecutionFailure` of that automation
 *   (deposits/withdraws belong to no automation, so they are excluded).
 * Failures sort by `firstFailedAt` (stable: the row stays put as it updates).
 * Offset pagination, matching the existing `/history` pattern.
 */
@Injectable()
export class ExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async getExecutions(
    vaultAddress: string,
    automationId: number | undefined,
    page: number,
    pageSize: number,
  ): Promise<ExecutionPage> {
    const vault = await this.prisma.vault.findUnique({ where: { address: vaultAddress } });
    if (!vault) throw new BadRequestException('VAULT_NOT_FOUND');

    const offset = (page - 1) * pageSize;
    const vaultId = vault.id;
    const includeVaultEvents = automationId === undefined;
    const execFilter =
      automationId !== undefined ? Prisma.sql`AND "automationId" = ${automationId}` : Prisma.empty;

    const execSelect = Prisma.sql`
      SELECT 'execution' AS kind, id, "blockTimestamp", "blockNumber", "logIndex", "txHash",
             "automationId", "executorAddress", "gasCompAmount", "gasCompToken", "gasCompUsd",
             NULL::text AS "eventType", NULL::text AS token, NULL::text AS amount,
             NULL::text AS "amountUsd", NULL::text AS "feeAmount", NULL::int AS "feeBps",
             NULL::text AS "failureStatus", NULL::text AS "errorMessage", NULL::int AS "attemptCount",
             NULL::timestamp AS "firstFailedAt", NULL::timestamp AS "lastFailedAt", NULL::timestamp AS "resolvedAt"
      FROM "Execution" WHERE "vaultId" = ${vaultId} ${execFilter}`;

    const failureSelect = Prisma.sql`
      SELECT 'failure' AS kind, id, "firstFailedAt" AS "blockTimestamp", 0 AS "blockNumber", 0 AS "logIndex",
             "lastTxHash" AS "txHash", "automationId", "executorAddress",
             NULL::text AS "gasCompAmount", NULL::text AS "gasCompToken", NULL::text AS "gasCompUsd",
             NULL::text AS "eventType", NULL::text AS token, NULL::text AS amount,
             NULL::text AS "amountUsd", NULL::text AS "feeAmount", NULL::int AS "feeBps",
             CASE WHEN "resolvedAt" IS NULL THEN 'open' ELSE 'resolved' END AS "failureStatus",
             "errorMessage", "attemptCount", "firstFailedAt", "lastFailedAt", "resolvedAt"
      FROM "ExecutionFailure" WHERE "vaultId" = ${vaultId} ${execFilter}`;

    const vaultEventSelect = Prisma.sql`
      SELECT 'vault_event' AS kind, id, "blockTimestamp", "blockNumber", "logIndex", "txHash",
             NULL::int AS "automationId", NULL::text AS "executorAddress",
             NULL::text AS "gasCompAmount", NULL::text AS "gasCompToken", NULL::text AS "gasCompUsd",
             "eventType", token, amount, "amountUsd", "feeAmount", "feeBps",
             NULL::text AS "failureStatus", NULL::text AS "errorMessage", NULL::int AS "attemptCount",
             NULL::timestamp AS "firstFailedAt", NULL::timestamp AS "lastFailedAt", NULL::timestamp AS "resolvedAt"
      FROM "VaultEvent" WHERE "vaultId" = ${vaultId}`;

    const branches = includeVaultEvents
      ? Prisma.sql`${execSelect} UNION ALL ${vaultEventSelect} UNION ALL ${failureSelect}`
      : Prisma.sql`${execSelect} UNION ALL ${failureSelect}`;

    const rows = await this.prisma.$queryRaw<UnifiedHistoryRow[]>(Prisma.sql`
      SELECT * FROM (${branches}) u
      ORDER BY u."blockTimestamp" DESC, u."logIndex" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const vaultEventCount = includeVaultEvents
      ? Prisma.sql`+ (SELECT COUNT(*) FROM "VaultEvent" WHERE "vaultId" = ${vaultId})`
      : Prisma.empty;
    const totalRows = await this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM "Execution" WHERE "vaultId" = ${vaultId} ${execFilter})
        + (SELECT COUNT(*) FROM "ExecutionFailure" WHERE "vaultId" = ${vaultId} ${execFilter})
        ${vaultEventCount} AS total
    `);

    return {
      rows: rows.map((r) => ({
        ...r,
        blockNumber: Number(r.blockNumber),
        logIndex: Number(r.logIndex),
        attemptCount: r.attemptCount === null ? null : Number(r.attemptCount),
      })),
      total: Number(totalRows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }
}
