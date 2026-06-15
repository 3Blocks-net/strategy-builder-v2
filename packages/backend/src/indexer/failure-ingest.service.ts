import { BadRequestException, Injectable } from '@nestjs/common';
import { getAddress } from 'ethers';
import { PrismaService } from '../database/prisma.service';
import { ContractErrorService } from '../blockchain/contract-error.service';

export interface FailureIngestDto {
  vaultAddress: string;
  automationId: number;
  txHash?: string | null;
  executorAddress: string;
  errorData?: string | null;
  errorMessageFallback?: string | null;
  failurePath: 'execution' | 'trigger-check';
  timestamp?: string | null;
}

/**
 * Records keeper-reported failures (PEC-219 #05).
 *
 * Collapses to ONE open `ExecutionFailure` per `(vaultId, automationId)`: an
 * existing open row gets `attemptCount++` and refreshed reason/timestamp; else a
 * new row opens. The indexer later sets `resolvedAt` when the automation
 * succeeds (a subsequent failure then opens a fresh row). The decoded reason
 * comes from the raw revert bytes, falling back to the keeper's short message.
 */
@Injectable()
export class FailureIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly errors: ContractErrorService,
  ) {}

  async ingest(dto: FailureIngestDto): Promise<{ id: string; attemptCount: number }> {
    let vaultAddress: string;
    try {
      vaultAddress = getAddress(dto.vaultAddress);
    } catch {
      throw new BadRequestException('INVALID_VAULT_ADDRESS');
    }

    const vault = await this.prisma.vault.findUnique({ where: { address: vaultAddress } });
    if (!vault) throw new BadRequestException('VAULT_NOT_FOUND');

    const errorMessage = this.errors.decodeRevert(dto.errorData, dto.errorMessageFallback);
    const at = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const executor = this.safeChecksum(dto.executorAddress);

    const open = await this.prisma.executionFailure.findFirst({
      where: { vaultId: vault.id, automationId: dto.automationId, resolvedAt: null },
    });

    if (open) {
      const updated = await this.prisma.executionFailure.update({
        where: { id: open.id },
        data: {
          attemptCount: { increment: 1 },
          lastFailedAt: at,
          errorMessage,
          failurePath: dto.failurePath,
          lastTxHash: dto.txHash ?? open.lastTxHash,
          executorAddress: executor ?? open.executorAddress,
        },
      });
      return { id: updated.id, attemptCount: updated.attemptCount };
    }

    const created = await this.prisma.executionFailure.create({
      data: {
        vaultId: vault.id,
        automationId: dto.automationId,
        executorAddress: executor ?? dto.executorAddress,
        lastTxHash: dto.txHash ?? null,
        errorMessage,
        failurePath: dto.failurePath,
        attemptCount: 1,
        firstFailedAt: at,
        lastFailedAt: at,
      },
    });
    return { id: created.id, attemptCount: created.attemptCount };
  }

  private safeChecksum(addr: string): string | null {
    try {
      return getAddress(addr);
    } catch {
      return null;
    }
  }
}
