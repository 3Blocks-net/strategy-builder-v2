import { BadRequestException } from '@nestjs/common';
import { ExecutionService } from './execution.service';

const vault = { id: 'v1', address: '0xVault' };

/** Both views run a raw UNION; $queryRaw returns queued results (rows, then total). */
function makePrisma(queryRawQueue: any[][]) {
  const queue = [...queryRawQueue];
  return {
    vault: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.address === vault.address ? vault : null,
      ),
    },
    $queryRaw: jest.fn(async () => queue.shift() ?? []),
  } as any;
}

describe('ExecutionService', () => {
  it('vault-wide UNION merges executions, vault events and failures', async () => {
    const unionRows = [
      { kind: 'failure', id: 'f1', txHash: null, blockNumber: 0n, logIndex: 0n, blockTimestamp: new Date(), automationId: 2, executorAddress: '0xk', gasCompAmount: null, gasCompToken: null, gasCompUsd: null, eventType: null, token: null, amount: null, feeAmount: null, feeBps: null, failureStatus: 'open', errorMessage: 'Step 1: HF too low', attemptCount: 5n, firstFailedAt: new Date(), lastFailedAt: new Date(), resolvedAt: null },
      { kind: 'vault_event', id: 'd1', txHash: '0xd', blockNumber: 12n, logIndex: 0n, blockTimestamp: new Date(), automationId: null, executorAddress: null, gasCompAmount: null, gasCompToken: null, gasCompUsd: null, eventType: 'DEPOSIT', token: '0xtok', amount: '100', feeAmount: '1', feeBps: 100, failureStatus: null, errorMessage: null, attemptCount: null, firstFailedAt: null, lastFailedAt: null, resolvedAt: null },
      { kind: 'execution', id: 'e1', txHash: '0x1', blockNumber: 10n, logIndex: 0n, blockTimestamp: new Date(), automationId: 1, executorAddress: '0xexec', gasCompAmount: '1', gasCompToken: '0xtok', gasCompUsd: '0.5', eventType: null, token: null, amount: null, feeAmount: null, feeBps: null, failureStatus: null, errorMessage: null, attemptCount: null, firstFailedAt: null, lastFailedAt: null, resolvedAt: null },
    ];
    const svc = new ExecutionService(makePrisma([unionRows, [{ total: 3n }]]));
    const res = await svc.getExecutions('0xVault', undefined, 1, 20);

    expect(res.total).toBe(3);
    expect(res.rows.map((r) => r.kind)).toEqual(['failure', 'vault_event', 'execution']);
    // bigint -> number coercion
    expect(res.rows[0].attemptCount).toBe(5);
    expect(res.rows[0].failureStatus).toBe('open');
    expect(res.rows[1].blockNumber).toBe(12);
  });

  it('filtered view returns executions + failures of one automation', async () => {
    const rows = [
      { kind: 'execution', id: 'e1', txHash: '0x1', blockNumber: 10n, logIndex: 0n, blockTimestamp: new Date(), automationId: 7, executorAddress: '0xexec', gasCompAmount: null, gasCompToken: null, gasCompUsd: null, eventType: null, token: null, amount: null, feeAmount: null, feeBps: null, failureStatus: null, errorMessage: null, attemptCount: null, firstFailedAt: null, lastFailedAt: null, resolvedAt: null },
      { kind: 'failure', id: 'f1', txHash: null, blockNumber: 0n, logIndex: 0n, blockTimestamp: new Date(), automationId: 7, executorAddress: '0xk', gasCompAmount: null, gasCompToken: null, gasCompUsd: null, eventType: null, token: null, amount: null, feeAmount: null, feeBps: null, failureStatus: 'resolved', errorMessage: 'x', attemptCount: 2n, firstFailedAt: new Date(), lastFailedAt: new Date(), resolvedAt: new Date() },
    ];
    const prisma = makePrisma([rows, [{ total: 2n }]]);
    const svc = new ExecutionService(prisma);
    const res = await svc.getExecutions('0xVault', 7, 1, 20);
    expect(res.total).toBe(2);
    expect(res.rows.every((r) => r.kind !== 'vault_event')).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('rejects an unknown vault', async () => {
    const svc = new ExecutionService(makePrisma([]));
    await expect(svc.getExecutions('0xNope', undefined, 1, 20)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
