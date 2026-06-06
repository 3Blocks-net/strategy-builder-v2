import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  HistoryRange,
  MAX_HISTORY_POINTS,
  VALID_RANGES,
  downsample,
  isHistoryRange,
  rangeToCutoff,
} from './history';

export interface HistoryPoint {
  t: string; // ISO timestamp
  valueUsd: number;
}

export interface HistoryMarker {
  t: string;
  type: string; // 'DEPOSIT' | 'WITHDRAW'
  token: string;
  amount: string;
  amountUsd: number | null;
}

export interface ValueHistory {
  range: HistoryRange;
  points: HistoryPoint[];
  markers: HistoryMarker[];
  /** First-ever snapshot timestamp — drives the "history from <date>" label. */
  historyStartsAt: string | null;
}

/**
 * Value-history read model (slice #05). Serves the snapshot series + the owner's
 * deposit/withdraw markers for a range, downsampled to a bounded point count.
 */
@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getValueHistory(
    address: string,
    rangeInput: string,
  ): Promise<ValueHistory> {
    if (!isHistoryRange(rangeInput)) {
      throw new BadRequestException(
        `range must be one of ${VALID_RANGES.join(', ')}`,
      );
    }
    const range: HistoryRange = rangeInput;

    const vault = await this.prisma.vault.findUnique({
      where: { address },
      select: { id: true },
    });
    if (!vault) {
      return { range, points: [], markers: [], historyStartsAt: null };
    }

    const now = new Date();
    const cutoff = rangeToCutoff(range, now);

    const [first, snaps, events] = await Promise.all([
      this.prisma.vaultValueSnapshot.findFirst({
        where: { vaultId: vault.id },
        orderBy: { asOf: 'asc' },
        select: { asOf: true },
      }),
      this.prisma.vaultValueSnapshot.findMany({
        where: { vaultId: vault.id, ...(cutoff ? { asOf: { gte: cutoff } } : {}) },
        orderBy: { asOf: 'asc' },
        select: { asOf: true, totalValueUsd: true },
      }),
      this.prisma.vaultEvent.findMany({
        where: {
          vaultId: vault.id,
          eventType: { in: ['DEPOSIT', 'WITHDRAW'] },
          ...(cutoff ? { blockTimestamp: { gte: cutoff } } : {}),
        },
        orderBy: { blockTimestamp: 'asc' },
        select: {
          eventType: true,
          token: true,
          amount: true,
          amountUsd: true,
          blockTimestamp: true,
        },
      }),
    ]);

    const points = downsample(
      snaps.map((s) => ({
        t: s.asOf.toISOString(),
        valueUsd: Number(s.totalValueUsd),
      })),
      MAX_HISTORY_POINTS,
    );

    const markers: HistoryMarker[] = events.map((e) => ({
      t: e.blockTimestamp.toISOString(),
      type: e.eventType,
      token: e.token,
      amount: e.amount,
      amountUsd: e.amountUsd != null ? Number(e.amountUsd) : null,
    }));

    return {
      range,
      points,
      markers,
      historyStartsAt: first?.asOf.toISOString() ?? null,
    };
  }
}
