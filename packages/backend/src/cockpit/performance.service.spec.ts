import { PerformanceService } from './performance.service';

function makeSnapshots(totalValueUsd: number) {
  return {
    getPositionsView: jest
      .fn()
      .mockResolvedValue({ totalValueUsd, positions: [], source: 'snapshot' }),
  } as any;
}

describe('PerformanceService', () => {
  it('computes all-time PnL + costs from VaultEvent + Execution', async () => {
    const prisma = {
      vault: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
      vaultEvent: {
        findMany: jest.fn().mockResolvedValue([
          { eventType: 'DEPOSIT', amountUsd: '1000', feeBps: 50 }, // fee 5
          { eventType: 'WITHDRAW', amountUsd: '200', feeBps: 50 }, // fee 1
        ]),
      },
      execution: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ gasCompUsd: '2' }, { gasCompUsd: '3' }]),
      },
      // present but must never be read (firewall)
      protocolFlow: { findMany: jest.fn().mockResolvedValue([{ amountUsd: '999' }]) },
    } as any;

    const svc = new PerformanceService(prisma, makeSnapshots(900));
    const res = await svc.getPerformance('0xA');

    expect(res.netDepositsUsd).toBe(800); // 1000 − 200
    expect(res.currentValueUsd).toBe(900);
    expect(res.pnlAbsUsd).toBe(100); // 900 − 800
    expect(res.pnlPct).toBeCloseTo(0.125); // 100 / 800
    expect(res.costsUsd).toBeCloseTo(11); // fees 5+1 + gas 2+3
  });

  it('FIREWALL: a ProtocolFlow row never affects net deposits', async () => {
    const protocolFlowFindMany = jest
      .fn()
      .mockResolvedValue([{ eventType: 'AAVE_SUPPLY', amountUsd: '5000' }]);
    const prisma = {
      vault: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
      vaultEvent: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ eventType: 'DEPOSIT', amountUsd: '100', feeBps: 0 }]),
      },
      execution: { findMany: jest.fn().mockResolvedValue([]) },
      protocolFlow: { findMany: protocolFlowFindMany },
    } as any;

    const svc = new PerformanceService(prisma, makeSnapshots(100));
    const res = await svc.getPerformance('0xA');

    expect(res.netDepositsUsd).toBe(100); // NOT 5100
    expect(protocolFlowFindMany).not.toHaveBeenCalled(); // never queried
  });

  it('range: flow-adjusts against the baseline snapshot (deposit-in-window ≠ profit)', async () => {
    const prisma = {
      vault: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
      vaultValueSnapshot: {
        // baseline value at range start = $100
        findFirst: jest.fn().mockResolvedValue({ totalValueUsd: '100' }),
      },
      vaultEvent: {
        // a $50 deposit inside the window
        findMany: jest
          .fn()
          .mockResolvedValue([{ eventType: 'DEPOSIT', amountUsd: '50', feeBps: 0 }]),
      },
      execution: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    // current value $150 = baseline 100 + deposit 50, zero strategy gain
    const svc = new PerformanceService(prisma, makeSnapshots(150));
    const res = await svc.getPerformance('0xA', '7d');

    expect(res.pnlAbsUsd).toBe(0); // NOT +50
    // a cutoff filter was applied to the event query
    expect(
      prisma.vaultEvent.findMany.mock.calls[0][0].where.blockTimestamp.gte,
    ).toBeInstanceOf(Date);
  });

  it('rejects an invalid range with 400', async () => {
    const prisma = {
      vault: { findUnique: jest.fn() },
    } as any;
    const svc = new PerformanceService(prisma, makeSnapshots(0));
    await expect(svc.getPerformance('0xA', '1y')).rejects.toBeTruthy();
  });

  it('handles a fresh vault with no deposits (pnlPct null, no NaN)', async () => {
    const prisma = {
      vault: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
      vaultEvent: { findMany: jest.fn().mockResolvedValue([]) },
      execution: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const svc = new PerformanceService(prisma, makeSnapshots(0));
    const res = await svc.getPerformance('0xA');
    expect(res).toEqual({
      currentValueUsd: 0,
      netDepositsUsd: 0,
      pnlAbsUsd: 0,
      pnlPct: null,
      costsUsd: 0,
    });
  });
});
