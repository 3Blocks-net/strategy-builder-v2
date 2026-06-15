import { getAddress } from 'ethers';
import { IndexerService } from './indexer.service';
import { IndexerCursorStore } from './indexer-cursor.store';
import { NoopExecutionEvents } from './execution-events.port';
import { vaultEventInterface } from './event-mapper';
import { IndexerProvider } from './indexer-provider';

/**
 * Indexer `tick()` integration against an in-memory Prisma + a fake provider
 * (the repo convention — no live DB / fork). Asserts the operator-facing
 * guarantees: correct mapping, multi-vault, confirmation lag, idempotency,
 * cursor resume, known-vault gating, post-boot discovery, owner-null-gas.
 */

const VAULT_A = getAddress('0x1111111111111111111111111111111111111111');
const VAULT_B = getAddress('0x2222222222222222222222222222222222222222');
const UNKNOWN = getAddress('0x3333333333333333333333333333333333333333');
const EXECUTOR = getAddress('0x4444444444444444444444444444444444444444');
const TOKEN = getAddress('0x55d398326f99059fF775485246999027B3197955');

interface FakeLog {
  address: string;
  transactionHash: string;
  blockNumber: number;
  index: number;
  topics: string[];
  data: string;
}

function makeLog(
  vault: string,
  name: string,
  args: any[],
  o: { txHash: string; blockNumber: number; index: number },
): FakeLog {
  const ev = vaultEventInterface.getEvent(name)!;
  const { data, topics } = vaultEventInterface.encodeEventLog(ev, args);
  return {
    address: vault,
    transactionHash: o.txHash,
    blockNumber: o.blockNumber,
    index: o.index,
    topics: [...topics],
    data,
  };
}

/** Minimal in-memory Prisma double covering the surface the indexer touches. */
function makePrisma(vaults: { id: string; address: string; createdAtBlock: number }[]) {
  const executions: any[] = [];
  const vaultEvents: any[] = [];
  const failures: any[] = [];
  const cursors = new Map<string, any>();
  const key = (e: { txHash: string; logIndex: number }) => `${e.txHash}:${e.logIndex}`;

  const matchesOr = (row: any, or: any[]) =>
    or.some((c) => row.txHash === c.txHash && row.logIndex === c.logIndex);

  const db: any = {
    _executions: executions,
    _vaultEvents: vaultEvents,
    _failures: failures,
    vault: {
      findMany: jest.fn(async () => vaults.map((v) => ({ id: v.id, address: v.address }))),
      aggregate: jest.fn(async () => ({
        _min: { createdAtBlock: vaults.length ? Math.min(...vaults.map((v) => v.createdAtBlock)) : null },
      })),
      findUnique: jest.fn(async ({ where }: any) =>
        vaults.find((v) => v.address === where.address) ?? null,
      ),
    },
    indexerCursor: {
      findUnique: jest.fn(async ({ where }: any) => cursors.get(where.feed) ?? null),
      upsert: jest.fn(async ({ where, create }: any) => {
        if (!cursors.has(where.feed)) cursors.set(where.feed, { ...create });
        return cursors.get(where.feed);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        cursors.set(where.feed, { ...cursors.get(where.feed), ...data });
        return cursors.get(where.feed);
      }),
    },
    execution: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.OR) return executions.filter((e) => matchesOr(e, where.OR));
        return executions.filter((e) => !where?.vaultId || e.vaultId === where.vaultId);
      }),
      createMany: jest.fn(async ({ data }: any) => {
        let count = 0;
        for (const d of data) {
          if (!executions.some((e) => key(e) === key(d))) {
            executions.push({ id: `ex-${executions.length}`, ...d });
            count++;
          }
        }
        return { count };
      }),
      count: jest.fn(async ({ where }: any) =>
        executions.filter((e) => !where?.vaultId || e.vaultId === where.vaultId).length,
      ),
    },
    vaultEvent: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.OR) return vaultEvents.filter((e) => matchesOr(e, where.OR));
        return vaultEvents.filter((e) => !where?.vaultId || e.vaultId === where.vaultId);
      }),
      createMany: jest.fn(async ({ data }: any) => {
        let count = 0;
        for (const d of data) {
          if (!vaultEvents.some((e) => key(e) === key(d))) {
            vaultEvents.push({ id: `ve-${vaultEvents.length}`, ...d });
            count++;
          }
        }
        return { count };
      }),
    },
    executionFailure: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const f of failures) {
          if (
            f.vaultId === where.vaultId &&
            f.automationId === where.automationId &&
            (where.resolvedAt === null ? f.resolvedAt == null : true)
          ) {
            Object.assign(f, data);
            count++;
          }
        }
        return { count };
      }),
    },
  };
  // $transaction(fn) runs the callback against the same in-memory store.
  db.$transaction = async (fn: any) => fn(db);
  return db;
}

/** Fake provider serving a fixed set of logs and linear block timestamps. */
function makeProvider(logs: FakeLog[], headRef: { head: number }): IndexerProvider {
  return {
    getBlockNumber: jest.fn(async () => headRef.head),
    getLogs: jest.fn(async ({ fromBlock, toBlock, topics }: any) => {
      const allowed: string[] = topics[0];
      return logs.filter(
        (l) =>
          l.blockNumber >= fromBlock &&
          l.blockNumber <= toBlock &&
          allowed.includes(l.topics[0]),
      );
    }),
    getBlock: jest.fn(async (n: number) => ({ timestamp: 1_700_000_000 + n })),
    destroy: jest.fn(async () => {}),
  } as any;
}

const priceServiceStub = { getPrices: jest.fn(async () => new Map()) } as any;
const configStub = { get: jest.fn(() => undefined) } as any;

function buildService(prisma: any, provider: IndexerProvider) {
  const cursor = new IndexerCursorStore(prisma);
  const svc = new IndexerService(
    configStub,
    prisma,
    priceServiceStub,
    cursor,
    new NoopExecutionEvents(),
    provider,
  );
  return { svc, cursor };
}

describe('IndexerService.tick (integration)', () => {
  it('indexes a confirmed success and joins GasCompSettled', async () => {
    const prisma = makePrisma([{ id: 'va', address: VAULT_A, createdAtBlock: 1 }]);
    const head = { head: 20 };
    const logs = [
      makeLog(VAULT_A, 'AutomationExecuted', [5, EXECUTOR], { txHash: '0xa', blockNumber: 10, index: 0 }),
      makeLog(VAULT_A, 'GasCompSettled', [5, EXECUTOR, TOKEN, 777n], { txHash: '0xa', blockNumber: 10, index: 1 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();

    expect(prisma._executions).toHaveLength(1);
    expect(prisma._executions[0]).toMatchObject({
      vaultId: 'va',
      automationId: 5,
      executorAddress: EXECUTOR,
      txHash: '0xa',
      logIndex: 0,
      gasCompAmount: '777',
      gasCompToken: TOKEN,
      gasCompUsd: null, // price stub returns empty
    });
  });

  it('leaves gas fields null for an owner run (no GasCompSettled)', async () => {
    const prisma = makePrisma([{ id: 'va', address: VAULT_A, createdAtBlock: 1 }]);
    const head = { head: 20 };
    const logs = [
      makeLog(VAULT_A, 'AutomationExecuted', [1, EXECUTOR], { txHash: '0xo', blockNumber: 9, index: 0 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();

    expect(prisma._executions).toHaveLength(1);
    expect(prisma._executions[0].gasCompAmount).toBeNull();
    expect(prisma._executions[0].gasCompToken).toBeNull();
  });

  it('maps two vaults executed in one range via the single address-less getLogs', async () => {
    const prisma = makePrisma([
      { id: 'va', address: VAULT_A, createdAtBlock: 1 },
      { id: 'vb', address: VAULT_B, createdAtBlock: 1 },
    ]);
    const head = { head: 20 };
    const logs = [
      makeLog(VAULT_A, 'AutomationExecuted', [1, EXECUTOR], { txHash: '0xa', blockNumber: 10, index: 0 }),
      makeLog(VAULT_B, 'AutomationExecuted', [2, EXECUTOR], { txHash: '0xb', blockNumber: 11, index: 0 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();

    const byVault = prisma._executions.reduce((m: any, e: any) => ((m[e.vaultId] = e), m), {});
    expect(byVault['va'].automationId).toBe(1);
    expect(byVault['vb'].automationId).toBe(2);
  });

  it('gates out logs from an unknown (non-vault) address', async () => {
    const prisma = makePrisma([{ id: 'va', address: VAULT_A, createdAtBlock: 1 }]);
    const head = { head: 20 };
    const logs = [
      makeLog(UNKNOWN, 'AutomationExecuted', [9, EXECUTOR], { txHash: '0xz', blockNumber: 10, index: 0 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();

    expect(prisma._executions).toHaveLength(0);
  });

  it('does not index events still inside the confirmation window', async () => {
    const prisma = makePrisma([{ id: 'va', address: VAULT_A, createdAtBlock: 1 }]);
    const head = { head: 12 }; // confirmations=5 => safe head 7
    const logs = [
      makeLog(VAULT_A, 'AutomationExecuted', [1, EXECUTOR], { txHash: '0xc', blockNumber: 10, index: 0 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();
    expect(prisma._executions).toHaveLength(0); // block 10 > safe head 7

    // head advances past the confirmation window => now indexed
    head.head = 20;
    await svc.tick();
    expect(prisma._executions).toHaveLength(1);
  });

  it('is idempotent across overlapping re-scans', async () => {
    const prisma = makePrisma([{ id: 'va', address: VAULT_A, createdAtBlock: 1 }]);
    const head = { head: 20 };
    const logs = [
      makeLog(VAULT_A, 'AutomationExecuted', [1, EXECUTOR], { txHash: '0xa', blockNumber: 10, index: 0 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();
    // force a re-scan of the same range by rewinding the cursor
    await cursor.advance(0, null);
    await svc.tick();

    expect(prisma._executions).toHaveLength(1);
  });

  it('resumes from cursor+1 after a restart with no gap and no duplicate', async () => {
    const prisma = makePrisma([{ id: 'va', address: VAULT_A, createdAtBlock: 1 }]);
    const head = { head: 20 };
    const logs = [
      makeLog(VAULT_A, 'AutomationExecuted', [1, EXECUTOR], { txHash: '0xa', blockNumber: 10, index: 0 }),
    ];
    const provider = makeProvider(logs, head);
    const first = buildService(prisma, provider);
    await first.cursor.initIfMissing(0);
    await first.svc.tick();
    expect(prisma._executions).toHaveLength(1);

    // a NEW execution arrives later (beyond the first cursor) and the head
    // advances to confirm it; a fresh service instance resumes from the cursor
    logs.push(
      makeLog(VAULT_A, 'AutomationExecuted', [2, EXECUTOR], { txHash: '0xb', blockNumber: 16, index: 0 }),
    );
    head.head = 25;
    const second = buildService(prisma, makeProvider(logs, head));
    await second.svc.tick();

    expect(prisma._executions).toHaveLength(2);
    expect(prisma._executions.map((e: any) => e.txHash).sort()).toEqual(['0xa', '0xb']);
  });

  it('indexes deposit and withdraw logs into VaultEvent rows (idempotent)', async () => {
    const prisma = makePrisma([{ id: 'va', address: VAULT_A, createdAtBlock: 1 }]);
    const head = { head: 20 };
    const logs = [
      makeLog(VAULT_A, 'Deposited', [TOKEN, 1000n], { txHash: '0xd', blockNumber: 10, index: 0 }),
      makeLog(VAULT_A, 'Withdrawn', [TOKEN, 500n, 3n, EXECUTOR], { txHash: '0xw', blockNumber: 11, index: 0 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();

    expect(prisma._vaultEvents).toHaveLength(2);
    const deposit = prisma._vaultEvents.find((e: any) => e.eventType === 'DEPOSIT');
    const withdraw = prisma._vaultEvents.find((e: any) => e.eventType === 'WITHDRAW');
    expect(deposit).toMatchObject({ vaultId: 'va', token: TOKEN, amount: '1000' });
    expect(withdraw).toMatchObject({ vaultId: 'va', amount: '500', feeAmount: '3' });

    // re-scan the same range → no duplicates
    await cursor.advance(0, null);
    await svc.tick();
    expect(prisma._vaultEvents).toHaveLength(2);
  });

  it('resolves an open failure atomically when the automation next succeeds', async () => {
    const prisma = makePrisma([{ id: 'va', address: VAULT_A, createdAtBlock: 1 }]);
    // pre-existing open failure for automation 5
    prisma._failures.push({
      id: 'f1', vaultId: 'va', automationId: 5, resolvedAt: null, attemptCount: 3,
    });
    const head = { head: 20 };
    const logs = [
      makeLog(VAULT_A, 'AutomationExecuted', [5, EXECUTOR], { txHash: '0xok', blockNumber: 10, index: 0 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();

    expect(prisma._executions).toHaveLength(1);
    expect(prisma._failures[0].resolvedAt).toBeInstanceOf(Date); // resolved
  });

  it('does NOT resolve an open failure of a different automation', async () => {
    const prisma = makePrisma([{ id: 'va', address: VAULT_A, createdAtBlock: 1 }]);
    prisma._failures.push({ id: 'f1', vaultId: 'va', automationId: 9, resolvedAt: null });
    const head = { head: 20 };
    const logs = [
      makeLog(VAULT_A, 'AutomationExecuted', [5, EXECUTOR], { txHash: '0xok', blockNumber: 10, index: 0 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();
    expect(prisma._failures[0].resolvedAt).toBeNull(); // unchanged
  });

  it('picks up a vault created after the first tick (per-tick known-vault reload)', async () => {
    const vaults = [{ id: 'va', address: VAULT_A, createdAtBlock: 1 }];
    const prisma = makePrisma(vaults);
    const head = { head: 20 };
    const logs = [
      makeLog(VAULT_A, 'AutomationExecuted', [1, EXECUTOR], { txHash: '0xa', blockNumber: 10, index: 0 }),
      makeLog(VAULT_B, 'AutomationExecuted', [2, EXECUTOR], { txHash: '0xb', blockNumber: 11, index: 0 }),
    ];
    const { svc, cursor } = buildService(prisma, makeProvider(logs, head));
    await cursor.initIfMissing(0);

    await svc.tick();
    expect(prisma._executions).toHaveLength(1); // only VAULT_A known; VAULT_B gated

    // VAULT_B is registered; rewind so the same range is re-scanned
    vaults.push({ id: 'vb', address: VAULT_B, createdAtBlock: 1 });
    await cursor.advance(0, null);
    await svc.tick();

    expect(prisma._executions).toHaveLength(2);
  });
});
