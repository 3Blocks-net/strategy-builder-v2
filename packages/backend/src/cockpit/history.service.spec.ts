import { BadRequestException } from '@nestjs/common';
import { HistoryService } from './history.service';

function makePrisma(over: any = {}) {
  return {
    vault: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
    vaultValueSnapshot: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ asOf: new Date('2026-05-01T00:00:00.000Z') }),
      findMany: jest.fn().mockResolvedValue([
        { asOf: new Date('2026-06-01T00:00:00.000Z'), totalValueUsd: '100' },
        { asOf: new Date('2026-06-02T00:00:00.000Z'), totalValueUsd: '110.5' },
      ]),
    },
    vaultEvent: {
      findMany: jest.fn().mockResolvedValue([
        {
          eventType: 'DEPOSIT',
          token: '0xUSDT',
          amount: '1000000000000000000',
          amountUsd: '1',
          blockTimestamp: new Date('2026-06-01T06:00:00.000Z'),
        },
      ]),
    },
    ...over,
  } as any;
}

describe('HistoryService', () => {
  it('returns downsampled points + markers + historyStartsAt', async () => {
    const svc = new HistoryService(makePrisma());
    const res = await svc.getValueHistory('0xA', '30d');

    expect(res.points).toEqual([
      { t: '2026-06-01T00:00:00.000Z', valueUsd: 100 },
      { t: '2026-06-02T00:00:00.000Z', valueUsd: 110.5 },
    ]);
    expect(res.markers).toHaveLength(1);
    expect(res.markers[0]).toMatchObject({ type: 'DEPOSIT', amountUsd: 1 });
    expect(res.historyStartsAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('rejects an invalid range with 400', async () => {
    const svc = new HistoryService(makePrisma());
    await expect(svc.getValueHistory('0xA', '1y')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns an empty history for an unknown vault', async () => {
    const prisma = makePrisma({
      vault: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const svc = new HistoryService(prisma);
    const res = await svc.getValueHistory('0xUnknown', 'all');
    expect(res).toEqual({
      range: 'all',
      points: [],
      markers: [],
      historyStartsAt: null,
    });
  });

  it('applies no time bound for "all" but a cutoff for bounded ranges', async () => {
    const prisma = makePrisma();
    const svc = new HistoryService(prisma);

    await svc.getValueHistory('0xA', 'all');
    expect(
      prisma.vaultValueSnapshot.findMany.mock.calls[0][0].where.asOf,
    ).toBeUndefined();

    await svc.getValueHistory('0xA', '24h');
    expect(
      prisma.vaultValueSnapshot.findMany.mock.calls[1][0].where.asOf.gte,
    ).toBeInstanceOf(Date);
  });
});
