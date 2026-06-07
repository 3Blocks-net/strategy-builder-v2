import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Contract, JsonRpcProvider } from "ethers";
import { PrismaService } from "../database/prisma.service";

export interface AlchemyTokenPosition {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  priceUsd: number | null;
}

@Injectable()
export class AlchemyService {
  private readonly logger = new Logger(AlchemyService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getTokenBalances(
    vaultAddress: string,
  ): Promise<AlchemyTokenPosition[]> {
    const nodeEnv = this.configService.get<string>("NODE_ENV", "production");
    if (nodeEnv === "development") {
      return this.getBalancesViaRpc(vaultAddress);
    }
    return this.getBalancesViaAlchemy([vaultAddress]).then(
      (m) => m.get(vaultAddress) ?? [],
    );
  }

  async getTokenBalancesBatch(
    vaultAddresses: string[],
  ): Promise<Map<string, AlchemyTokenPosition[]>> {
    const nodeEnv = this.configService.get<string>("NODE_ENV", "production");
    if (nodeEnv === "development") {
      const result = new Map<string, AlchemyTokenPosition[]>();
      for (const addr of vaultAddresses) {
        result.set(addr, await this.getBalancesViaRpc(addr));
      }
      return result;
    }

    const result = new Map<string, AlchemyTokenPosition[]>();
    for (let i = 0; i < vaultAddresses.length; i += 2) {
      const batch = vaultAddresses.slice(i, i + 2);
      const batchResult = await this.getBalancesViaAlchemy(batch);
      for (const [addr, positions] of batchResult) {
        result.set(addr, positions);
      }
    }
    return result;
  }

  private async getBalancesViaAlchemy(
    addresses: string[],
  ): Promise<Map<string, AlchemyTokenPosition[]>> {
    const apiKey = this.configService.get<string>("ALCHEMY_API_KEY");
    if (!apiKey) {
      this.logger.warn("ALCHEMY_API_KEY not configured");
      return new Map(addresses.map((a) => [a, []]));
    }

    const result = new Map<string, AlchemyTokenPosition[]>();

    for (const address of addresses) {
      try {
        const response = await fetch(
          `https://bnb-mainnet.g.alchemy.com/data/v1/${apiKey}/assets/tokens/by-address`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              addresses: [{ address, networks: ["bnb-mainnet"] }],
              withMetadata: true,
              withPrices: true,
            }),
          },
        );

        if (!response.ok) {
          this.logger.warn(
            `Alchemy API returned ${response.status} for ${address}`,
          );
          result.set(address, []);
          continue;
        }

        const data = await response.json();
        const positions = this.parseAlchemyResponse(data);
        result.set(address, positions);
      } catch (err) {
        this.logger.warn(`Alchemy API error for ${address}: ${err}`);
        result.set(address, []);
      }
    }

    return result;
  }

  private parseAlchemyResponse(data: any): AlchemyTokenPosition[] {
    const tokens: AlchemyTokenPosition[] = [];

    const results = data?.tokens ?? data?.result?.tokens ?? [];
    for (const token of results) {
      const balance = token.balance ?? token.tokenBalance ?? "0";
      if (balance === "0" || balance === "0x0") continue;

      tokens.push({
        address: token.contractAddress ?? token.address ?? "",
        symbol: token.symbol ?? token.metadata?.symbol ?? "UNKNOWN",
        name: token.name ?? token.metadata?.name ?? "Unknown Token",
        decimals: token.decimals ?? token.metadata?.decimals ?? 18,
        balance,
        priceUsd: token.prices?.[0]?.value ?? token.priceUsd ?? null,
      });
    }

    return tokens;
  }

  private async getBalancesViaRpc(
    vaultAddress: string,
  ): Promise<AlchemyTokenPosition[]> {
    const rpcUrl = this.configService.get<string>("RPC_URL");
    if (!rpcUrl) return [];

    const provider = new JsonRpcProvider(rpcUrl);
    const erc20Abi = [
      "function balanceOf(address) view returns (uint256)",
      "function symbol() view returns (string)",
      "function name() view returns (string)",
      "function decimals() view returns (uint8)",
    ];

    // Fee tokens (fallback) + every curated protocol token from the DB allowlist
    // (Aave reserves + PancakeSwap pairs — incl. BTCB), so tokens a vault borrows
    // or swaps into actually show up on the fork instead of only a hardcoded few.
    const fallbackTokens = [
      "0x55d398326f99059fF775485246999027B3197955", // USDT
      "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
      "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD
    ];
    let knownTokens = fallbackTokens;
    try {
      const protocolTokens = await this.prisma.protocolToken.findMany({
        where: { enabled: true },
        select: { address: true },
      });
      // dedupe case-insensitively, keep the original casing
      const byLower = new Map<string, string>();
      for (const a of [...fallbackTokens, ...protocolTokens.map((t) => t.address)]) {
        byLower.set(a.toLowerCase(), a);
      }
      knownTokens = [...byLower.values()];
    } catch (err) {
      this.logger.warn(
        `ProtocolToken lookup failed, using fallback token list: ${err}`,
      );
    }

    const positions: AlchemyTokenPosition[] = [];
    for (const addr of knownTokens) {
      try {
        const token = new Contract(addr, erc20Abi, provider);
        const balance: bigint = await token.balanceOf(vaultAddress);
        if (balance === 0n) continue;

        const [symbol, name, decimals] = await Promise.all([
          token.symbol(),
          token.name(),
          token.decimals(),
        ]);

        positions.push({
          address: addr,
          symbol,
          name,
          decimals: Number(decimals),
          balance: balance.toString(),
          priceUsd: null,
        });
      } catch {
        // token might not exist on this fork
      }
    }

    await provider.destroy();
    return positions;
  }
}
