import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Contract, JsonRpcProvider, Interface } from "ethers";

const FEE_REGISTRY_ABI = [
  "function depositFeeBps() external view returns (uint16)",
  "function withdrawFeeBps() external view returns (uint16)",
  "event TokenAdded(address indexed token, uint8 decimals)",
  "event TokenRemoved(address indexed token)",
];

const ERC20_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
];

export interface FeeRates {
  depositFeeBps: number;
  withdrawFeeBps: number;
}

export interface AcceptedToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class FeeService {
  private readonly logger = new Logger(FeeService.name);
  private feesCache: { data: FeeRates; expiresAt: number } | null = null;
  private tokensCache: { data: AcceptedToken[]; expiresAt: number } | null =
    null;

  constructor(private readonly configService: ConfigService) {}

  async getFees(): Promise<FeeRates> {
    if (this.feesCache && Date.now() < this.feesCache.expiresAt) {
      return this.feesCache.data;
    }

    const { provider, feeRegistry } = this.getContracts();
    const [depositFeeBps, withdrawFeeBps] = await Promise.all([
      feeRegistry.depositFeeBps(),
      feeRegistry.withdrawFeeBps(),
    ]);

    const data: FeeRates = {
      depositFeeBps: Number(depositFeeBps),
      withdrawFeeBps: Number(withdrawFeeBps),
    };

    this.feesCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    await provider.destroy();
    return data;
  }

  async getAcceptedTokens(): Promise<AcceptedToken[]> {
    if (this.tokensCache && Date.now() < this.tokensCache.expiresAt) {
      return this.tokensCache.data;
    }

    const { provider, feeRegistry } = this.getContracts();
    const feeRegistryAddress = this.configService.get<string>(
      "FEE_REGISTRY_ADDRESS",
    )!;
    const iface = new Interface(FEE_REGISTRY_ABI);

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10_000);

    const addedLogs = await provider.getLogs({
      address: feeRegistryAddress,
      topics: [iface.getEvent("TokenAdded")!.topicHash],
      fromBlock,
    });

    const removedLogs = await provider.getLogs({
      address: feeRegistryAddress,
      topics: [iface.getEvent("TokenRemoved")!.topicHash],
      fromBlock,
    });

    const removedSet = new Set(
      removedLogs.map((log) => {
        const parsed = iface.parseLog(log);
        return parsed!.args[0] as string;
      }),
    );

    const activeTokenAddresses: string[] = [];
    for (const log of addedLogs) {
      const parsed = iface.parseLog(log);
      const tokenAddr = parsed!.args[0] as string;
      if (!removedSet.has(tokenAddr)) {
        activeTokenAddresses.push(tokenAddr);
      }
    }
    const tokens: AcceptedToken[] = await Promise.all(
      activeTokenAddresses.map(async (addr) => {
        const token = new Contract(addr, ERC20_ABI, provider);
        const [name, symbol, decimals] = await Promise.all([
          token.name(),
          token.symbol(),
          token.decimals(),
        ]);
        return {
          address: addr,
          symbol: symbol as string,
          name: name as string,
          decimals: Number(decimals),
        };
      }),
    );

    this.tokensCache = { data: tokens, expiresAt: Date.now() + CACHE_TTL_MS };
    await provider.destroy();
    return tokens;
  }

  private getContracts() {
    const rpcUrl = this.configService.get<string>("RPC_URL")!;
    const feeRegistryAddress = this.configService.get<string>(
      "FEE_REGISTRY_ADDRESS",
    )!;

    const provider = new JsonRpcProvider(rpcUrl);
    const feeRegistry = new Contract(
      feeRegistryAddress,
      FEE_REGISTRY_ABI,
      provider,
    );
    return { provider, feeRegistry };
  }
}
