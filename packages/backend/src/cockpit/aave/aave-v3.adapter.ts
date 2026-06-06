import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider, getAddress } from 'ethers';
import { PrismaService } from '../../database/prisma.service';
import { ProtocolAdapter, ValuedPosition } from '../protocol-adapter';
import type { LogSubscription } from '../../indexer/protocol-flow';
import { base8ToUsd } from './aave-math';
import {
  AaveAccountRead,
  AaveReserveRead,
  buildAavePositions,
} from './aave-positions';
import { netPrincipalByReserve } from './aave-earnings';
import { buildAaveLogSubscriptions } from './aave-subscriptions';

const ADDRESSES_PROVIDER_ABI = [
  'function getPool() view returns (address)',
  'function getPriceOracle() view returns (address)',
];
const POOL_ABI = [
  'function getUserAccountData(address) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReserveData(address) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
];
const ORACLE_ABI = ['function getAssetPrice(address) view returns (uint256)'];
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

/** BSC Aave V3 PoolAddressesProvider (research §6). Overridable via config. */
const DEFAULT_ADDRESSES_PROVIDER =
  '0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D';

const READ_TTL_MS = 15 * 1000;

interface RawRead {
  reserves: AaveReserveRead[];
  account: AaveAccountRead;
  claimed: string[];
}

/**
 * Aave V3 read adapter (PRD: Modules → AaveV3Adapter).
 *
 * Pool + oracle are resolved at runtime from the PoolAddressesProvider (never
 * hardcoded), so a governance oracle re-point is followed. Per-reserve reads are
 * isolated — a single failing reserve is skipped, not fatal. Earnings are
 * deferred to slice #08. The exact `getReserveData` struct layout is verified by
 * the forked-mainnet integration test; on a decode mismatch the whole read fails
 * gracefully (ValuationService renders an error row, the rest of the vault stays).
 */
@Injectable()
export class AaveV3Adapter implements ProtocolAdapter {
  readonly protocol = 'aave-v3';
  private readonly logger = new Logger(AaveV3Adapter.name);
  private resolved: { pool: string; oracle: string } | null = null;
  private readonly cache = new Map<
    string,
    { data: RawRead; expiresAt: number }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getPositions(vaultAddress: string): Promise<ValuedPosition[]> {
    const raw = await this.read(vaultAddress);
    const netPrincipal = await this.netPrincipal(vaultAddress);
    return buildAavePositions(raw.reserves, raw.account, netPrincipal).positions;
  }

  async claimedTokens(vaultAddress: string): Promise<string[]> {
    const raw = await this.read(vaultAddress);
    return raw.claimed;
  }

  /**
   * Log subscriptions the indexer ingests into ProtocolFlow (slice #08): Aave
   * Pool `Supply` (onBehalfOf) + `Withdraw` (user), both at indexed topic 2.
   */
  async logSubscriptions(): Promise<LogSubscription[]> {
    const rpcUrl = this.config.get<string>('RPC_URL');
    if (!rpcUrl) return [];
    const provider = new JsonRpcProvider(rpcUrl);
    try {
      const { pool } = await this.resolveAddresses(provider);
      return buildAaveLogSubscriptions(pool);
    } catch (err) {
      this.logger.warn(`Aave logSubscriptions resolve failed: ${err}`);
      return [];
    } finally {
      await provider.destroy();
    }
  }

  /** Net principal USD per reserve from indexed ProtocolFlow rows (for earnings). */
  private async netPrincipal(
    vaultAddress: string,
  ): Promise<Map<string, number | null>> {
    try {
      const vault = await this.prisma.vault.findUnique({
        where: { address: vaultAddress },
        select: { id: true },
      });
      if (!vault) return new Map();
      const flows = await this.prisma.protocolFlow.findMany({
        where: { vaultId: vault.id, protocol: 'aave-v3' },
        select: { token: true, kind: true, amountUsd: true },
      });
      return netPrincipalByReserve(
        flows.map((f) => ({
          token: f.token,
          kind: f.kind,
          amountUsd: f.amountUsd != null ? Number(f.amountUsd) : null,
        })),
      );
    } catch (err) {
      this.logger.warn(`Aave net-principal read failed: ${err}`);
      return new Map();
    }
  }

  private async read(vaultAddress: string): Promise<RawRead> {
    const cached = this.cache.get(vaultAddress);
    if (cached && Date.now() < cached.expiresAt) return cached.data;

    const rpcUrl = this.config.get<string>('RPC_URL')!;
    const provider = new JsonRpcProvider(rpcUrl);
    try {
      const { pool: poolAddr, oracle: oracleAddr } =
        await this.resolveAddresses(provider);
      const pool = new Contract(poolAddr, POOL_ABI, provider);
      const oracle = new Contract(oracleAddr, ORACLE_ABI, provider);

      const acct = await pool.getUserAccountData(vaultAddress);
      const account: AaveAccountRead = {
        totalCollateralBase: acct.totalCollateralBase,
        totalDebtBase: acct.totalDebtBase,
        healthFactor: acct.healthFactor,
      };

      const curated = await this.prisma.protocolToken.findMany({
        where: { protocol: 'aave', enabled: true },
        select: { address: true, symbol: true, decimals: true },
      });

      const reserves: AaveReserveRead[] = [];
      const claimed: string[] = [];
      for (const t of curated) {
        try {
          const rd = await pool.getReserveData(t.address);
          const aToken = getAddress(rd.aTokenAddress);
          const variableDebtToken = getAddress(rd.variableDebtTokenAddress);
          claimed.push(aToken, variableDebtToken);

          const aTokenC = new Contract(aToken, ERC20_ABI, provider);
          const debtC = new Contract(variableDebtToken, ERC20_ABI, provider);
          const [supplied, debt, priceBase] = await Promise.all([
            aTokenC.balanceOf(vaultAddress) as Promise<bigint>,
            debtC.balanceOf(vaultAddress) as Promise<bigint>,
            oracle.getAssetPrice(t.address) as Promise<bigint>,
          ]);

          reserves.push({
            asset: getAddress(t.address),
            symbol: t.symbol,
            decimals: t.decimals,
            aToken,
            variableDebtToken,
            supplied,
            debt,
            priceUsd: priceBase > 0n ? base8ToUsd(priceBase) : null,
            supplyRateRay: rd.currentLiquidityRate,
            borrowRateRay: rd.currentVariableBorrowRate,
          });
        } catch (err) {
          this.logger.warn(
            `Aave reserve ${t.symbol} (${t.address}) read failed: ${err}`,
          );
        }
      }

      const data: RawRead = { reserves, account, claimed };
      this.cache.set(vaultAddress, {
        data,
        expiresAt: Date.now() + READ_TTL_MS,
      });
      return data;
    } finally {
      await provider.destroy();
    }
  }

  private async resolveAddresses(
    provider: JsonRpcProvider,
  ): Promise<{ pool: string; oracle: string }> {
    if (this.resolved) return this.resolved;
    const providerAddr =
      this.config.get<string>('AAVE_ADDRESSES_PROVIDER') ??
      DEFAULT_ADDRESSES_PROVIDER;
    const ap = new Contract(providerAddr, ADDRESSES_PROVIDER_ABI, provider);
    const [pool, oracle] = await Promise.all([
      ap.getPool() as Promise<string>,
      ap.getPriceOracle() as Promise<string>,
    ]);
    this.resolved = { pool: getAddress(pool), oracle: getAddress(oracle) };
    return this.resolved;
  }
}
