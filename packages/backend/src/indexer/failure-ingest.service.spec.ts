import { BadRequestException } from '@nestjs/common';
import { getAddress } from 'ethers';
import { FailureIngestService } from './failure-ingest.service';

const VAULT = getAddress('0x1111111111111111111111111111111111111111');
const EXEC = getAddress('0x2222222222222222222222222222222222222222');

function makePrisma() {
  const rows: any[] = [];
  return {
    _rows: rows,
    vault: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.address === VAULT ? { id: 'v1', address: VAULT } : null,
      ),
    },
    executionFailure: {
      findFirst: jest.fn(async ({ where }: any) =>
        rows.find(
          (r) =>
            r.vaultId === where.vaultId &&
            r.automationId === where.automationId &&
            r.resolvedAt == null,
        ) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `f${rows.length}`, resolvedAt: null, ...data };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (data.attemptCount?.increment) row.attemptCount += data.attemptCount.increment;
        if (data.lastFailedAt) row.lastFailedAt = data.lastFailedAt;
        if (data.errorMessage) row.errorMessage = data.errorMessage;
        if (data.lastTxHash !== undefined) row.lastTxHash = data.lastTxHash;
        return row;
      }),
    },
  } as any;
}

// decoder stub — returns a deterministic message
const errors = { decodeRevert: jest.fn(() => 'decoded reason') } as any;

describe('FailureIngestService', () => {
  const baseDto = {
    vaultAddress: VAULT,
    automationId: 1,
    executorAddress: EXEC,
    failurePath: 'execution' as const,
    errorMessageFallback: 'reverted',
  };

  it('opens a new failure row on first report', async () => {
    const prisma = makePrisma();
    const svc = new FailureIngestService(prisma, errors);
    const res = await svc.ingest({ ...baseDto, txHash: '0xabc' });
    expect(res.attemptCount).toBe(1);
    expect(prisma._rows).toHaveLength(1);
    expect(prisma._rows[0]).toMatchObject({
      vaultId: 'v1',
      automationId: 1,
      errorMessage: 'decoded reason',
      lastTxHash: '0xabc',
      resolvedAt: null,
    });
  });

  it('keeps ONE open row and increments attemptCount on repeated reports', async () => {
    const prisma = makePrisma();
    const svc = new FailureIngestService(prisma, errors);
    await svc.ingest(baseDto);
    await svc.ingest(baseDto);
    const res = await svc.ingest(baseDto);
    expect(prisma._rows).toHaveLength(1);
    expect(res.attemptCount).toBe(3);
  });

  it('opens a separate row for a different automation', async () => {
    const prisma = makePrisma();
    const svc = new FailureIngestService(prisma, errors);
    await svc.ingest({ ...baseDto, automationId: 1 });
    await svc.ingest({ ...baseDto, automationId: 2 });
    expect(prisma._rows).toHaveLength(2);
  });

  it('rejects an unknown vault', async () => {
    const prisma = makePrisma();
    const svc = new FailureIngestService(prisma, errors);
    await expect(
      svc.ingest({ ...baseDto, vaultAddress: getAddress('0x3333333333333333333333333333333333333333') }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a malformed vault address', async () => {
    const prisma = makePrisma();
    const svc = new FailureIngestService(prisma, errors);
    await expect(svc.ingest({ ...baseDto, vaultAddress: 'not-an-address' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
