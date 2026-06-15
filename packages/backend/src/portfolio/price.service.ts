import { Injectable, Logger } from '@nestjs/common';

export interface TokenPrice {
  address: string;
  priceUsd: number;
  confidence: number;
}

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);

  async getPrices(tokenAddresses: string[]): Promise<Map<string, TokenPrice>> {
    if (tokenAddresses.length === 0) return new Map();

    const coins = tokenAddresses
      .map((addr) => `bsc:${addr}`)
      .join(',');

    try {
      const response = await fetch(
        `https://coins.llama.fi/prices/current/${coins}`,
      );

      if (!response.ok) {
        this.logger.warn(`DeFiLlama returned ${response.status}`);
        return new Map();
      }

      const data = await response.json();
      const result = new Map<string, TokenPrice>();

      for (const addr of tokenAddresses) {
        const key = `bsc:${addr}`;
        const coin = data.coins?.[key];
        if (coin && coin.price != null && coin.confidence >= 0.5) {
          result.set(addr, {
            address: addr,
            priceUsd: coin.price,
            confidence: coin.confidence,
          });
        }
      }

      return result;
    } catch (err) {
      this.logger.warn(`DeFiLlama API error: ${err}`);
      return new Map();
    }
  }
}
