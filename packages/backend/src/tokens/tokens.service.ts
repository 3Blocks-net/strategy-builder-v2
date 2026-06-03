import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Curated, DB-backed token allowlist for a protocol (e.g. `aave`). Only
   * enabled, standard ERC-20s are returned. `decimals` feeds the frontend
   * tokenDecimals map for correct token-amount → base-units conversion.
   */
  async findByProtocol(protocol: string) {
    const tokens = await this.prisma.protocolToken.findMany({
      where: { protocol: protocol.toLowerCase(), enabled: true },
      select: { address: true, symbol: true, decimals: true },
      orderBy: { symbol: 'asc' },
    });
    return { tokens };
  }
}
