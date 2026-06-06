import {
  SnapshotService,
  resolveSnapshotRpcUrl,
} from './snapshot.service';
import { mapWithConcurrency } from './concurrency';

function makeConfig(over: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    SNAPSHOT_ENABLED: 'false', // keep the auto-loop off in tests; drive tick() manually
    SNAPSHOT_RETENTION_DAYS: '90',
    SNAPSHOT_CONCURRENCY: '4',
  };
  const merged = { ...defaults, ...over };
  return {
    get: (key: string, def?: any) => merged[key] ?? def,
  } as any;
}

describe('resolveSnapshotRpcUrl', () => {
  it('prefers the dedicated SNAPSHOT_RPC_URL', () => {
    expect(resolveSnapshotRpcUrl('https://snap', 'https://shared')).toBe(
      'https://snap',
    );
  });
  it('falls back to the shared RPC_URL', () => {
    expect(resolveSnapshotRpcUrl(undefined, 'https://shared')).toBe(
      'https://shared',
    );
  });
  it('is null when neither is set (→ dormant)', () => {
    expect(resolveSnapshotRpcUrl(undefined, undefined)).toBeNull();
  });
});

describe('mapWithConcurrency', () => {
  it('processes every item and never exceeds the limit', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const done: number[] = [];
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(items, 3, async (i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      done.push(i);
      active--;
    });
    expect(done.sort((a, b) => a - b)).toEqual(items);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('SnapshotService.tick', () => {
  it('writes one snapshot per known vault, stamped with the head block', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      vault: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'v1', address: '0xA' },
            { id: 'v2', address: '0xB' },
          ]),
      },
      vaultValueSnapshot: { create, deleteMany: jest.fn().mockResolvedValue({}) },
    } as any;
    const valuation = {
      valueVault: jest
        .fn()
        .mockResolvedValue({ positions: [{ kind: 'token' }], totalValueUsd: 42 }),
    } as any;
    const provider = { getBlockNumber: jest.fn().mockResolvedValue(123) } as any;

    const svc = new SnapshotService(makeConfig(), prisma, valuation, provider);
    svc.onModuleInit();
    await svc.tick();

    expect(valuation.valueVault).toHaveBeenCalledTimes(2);
    expect(valuation.valueVault).toHaveBeenCalledWith('0xA', { refresh: true });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].data).toMatchObject({
      vaultId: 'v1',
      blockNumber: 123,
      totalValueUsd: '42',
    });
  });

  it('prunes snapshots older than the retention window', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      vault: { findMany: jest.fn().mockResolvedValue([]) },
      vaultValueSnapshot: { create: jest.fn(), deleteMany },
    } as any;
    const svc = new SnapshotService(
      makeConfig({ SNAPSHOT_RETENTION_DAYS: '30' }),
      prisma,
      { valueVault: jest.fn() } as any,
      { getBlockNumber: jest.fn().mockResolvedValue(1) } as any,
    );
    svc.onModuleInit();
    await svc.tick();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    const cutoff: Date = deleteMany.mock.calls[0][0].where.asOf.lt;
    const ageDays = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(ageDays).toBeCloseTo(30, 1);
  });

  it('is dormant when no provider is configured', () => {
    const svc = new SnapshotService(
      makeConfig({ SNAPSHOT_ENABLED: 'true' }),
      {} as any,
      {} as any,
      null,
    );
    expect(() => svc.onModuleInit()).not.toThrow();
    // no timer scheduled, no throw — loop simply never starts
  });
});

describe('SnapshotService.getPositionsView', () => {
  const valuation = {
    valueVault: jest.fn().mockResolvedValue({
      vaultAddress: '0xA',
      positions: [],
      totalValueUsd: 7,
      asOfBlock: null,
      asOf: '2026-01-01T00:00:00.000Z',
    }),
  } as any;

  it('recomputes live on refresh (source = live)', async () => {
    const svc = new SnapshotService(makeConfig(), {} as any, valuation, null);
    const view = await svc.getPositionsView('0xA', true);
    expect(view.source).toBe('live');
    expect(valuation.valueVault).toHaveBeenCalledWith('0xA', { refresh: true });
  });

  it('serves the latest snapshot by default (source = snapshot)', async () => {
    const prisma = {
      vault: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
      vaultValueSnapshot: {
        findFirst: jest.fn().mockResolvedValue({
          breakdown: [{ kind: 'token' }],
          totalValueUsd: '99.5',
          blockNumber: 500,
          asOf: new Date('2026-02-02T00:00:00.000Z'),
        }),
      },
    } as any;
    const svc = new SnapshotService(makeConfig(), prisma, valuation, null);
    const view = await svc.getPositionsView('0xA', false);
    expect(view.source).toBe('snapshot');
    expect(view.totalValueUsd).toBe(99.5);
    expect(view.asOfBlock).toBe(500);
    expect(view.positions).toEqual([{ kind: 'token' }]);
  });

  it('cold start (no snapshot) falls back to a live ephemeral valuation', async () => {
    const prisma = {
      vault: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
      vaultValueSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const svc = new SnapshotService(makeConfig(), prisma, valuation, null);
    const view = await svc.getPositionsView('0xA', false);
    expect(view.source).toBe('live');
  });
});
