import { Injectable, Logger } from '@nestjs/common';
import { AlchemyService, AlchemyTokenPosition } from './alchemy.service';
import { PriceService } from './price.service';

export type PriceSource = 'alchemy' | 'defi-llama' | 'unavailable';

export interface PortfolioPosition {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  priceUsd: number | null;
  valueUsd: number | null;
  priceSource: PriceSource;
}

export interface VaultPortfolio {
  vaultAddress: string;
  positions: PortfolioPosition[];
  totalValueUsd: number;
}

const CACHE_TTL_MS = 60 * 1000;

@Injectable()
export class VaultPortfolioService {
  private readonly logger = new Logger(VaultPortfolioService.name);
  private cache = new Map<
    string,
    { data: VaultPortfolio; expiresAt: number }
  >();

  constructor(
    private readonly alchemyService: AlchemyService,
    private readonly priceService: PriceService,
  ) {}

  async getPortfolio(vaultAddress: string): Promise<VaultPortfolio> {
    const cached = this.cache.get(vaultAddress);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const alchemyPositions =
      await this.alchemyService.getTokenBalances(vaultAddress);

    const portfolio = await this.enrichWithFallbackPrices(
      vaultAddress,
      alchemyPositions,
    );

    this.cache.set(vaultAddress, {
      data: portfolio,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return portfolio;
  }

  async getOverview(
    vaults: { address: string; label: string; depositToken: string; chainId: number; createdAt: Date }[],
  ): Promise<
    {
      address: string;
      label: string;
      depositToken: string;
      chainId: number;
      totalValueUsd: number;
      createdAt: Date;
    }[]
  > {
    const addresses = vaults.map((v) => v.address);
    const balancesMap =
      await this.alchemyService.getTokenBalancesBatch(addresses);

    const results = await Promise.all(
      vaults.map(async (vault) => {
        const positions = balancesMap.get(vault.address) ?? [];
        const portfolio = await this.enrichWithFallbackPrices(
          vault.address,
          positions,
        );

        this.cache.set(vault.address, {
          data: portfolio,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return {
          address: vault.address,
          label: vault.label,
          depositToken: vault.depositToken,
          chainId: vault.chainId,
          totalValueUsd: portfolio.totalValueUsd,
          createdAt: vault.createdAt,
        };
      }),
    );

    return results;
  }

  private async enrichWithFallbackPrices(
    vaultAddress: string,
    alchemyPositions: AlchemyTokenPosition[],
  ): Promise<VaultPortfolio> {
    const missingPriceAddresses = alchemyPositions
      .filter((p) => p.priceUsd == null)
      .map((p) => p.address);

    const llamaPrices =
      missingPriceAddresses.length > 0
        ? await this.priceService.getPrices(missingPriceAddresses)
        : new Map();

    const positions: PortfolioPosition[] = alchemyPositions.map((p) => {
      let priceUsd: number | null = null;
      let priceSource: PriceSource = 'unavailable';

      if (p.priceUsd != null) {
        priceUsd = p.priceUsd;
        priceSource = 'alchemy';
      } else {
        const llama = llamaPrices.get(p.address);
        if (llama) {
          priceUsd = llama.priceUsd;
          priceSource = 'defi-llama';
        }
      }

      const balanceNum = parseFloat(p.balance) / 10 ** p.decimals;
      const valueUsd = priceUsd != null ? balanceNum * priceUsd : null;

      return {
        address: p.address,
        symbol: p.symbol,
        name: p.name,
        decimals: p.decimals,
        balance: p.balance,
        priceUsd,
        valueUsd,
        priceSource,
      };
    });

    const totalValueUsd = positions.reduce(
      (sum, p) => sum + (p.valueUsd ?? 0),
      0,
    );

    return { vaultAddress, positions, totalValueUsd };
  }
}
