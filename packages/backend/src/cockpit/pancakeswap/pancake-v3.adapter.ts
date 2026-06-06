import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider, getAddress } from 'ethers';
import { PriceService } from '../../portfolio/price.service';
import { ProtocolAdapter, ValuedPosition } from '../protocol-adapter';
import { buildLpPosition, LpRawRead } from './lp-position';

const NPM_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) returns (uint256 amount0, uint256 amount1)',
];
const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
];
const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)',
];
const ERC20_META_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const DEFAULT_NPM = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
const DEFAULT_FACTORY = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const MAX_U128 = 2n ** 128n - 1n;

/**
 * PancakeSwap V3 LP read adapter (PRD: Modules → PancakeV3Adapter).
 *
 * Enumerates the vault's position NFTs, derives token amounts via the pure
 * LpMath, and reads **live uncollected fees via a `collect` static-call** (never
 * the stale `tokensOwed`). Each position is isolated — one broken NFT becomes an
 * error row, not a failed panel. `claimedTokens` = the NPM address. Verified end
 * to end by the forked-mainnet integration test.
 */
@Injectable()
export class PancakeV3Adapter implements ProtocolAdapter {
  readonly protocol = 'pancakeswap-v3';
  private readonly logger = new Logger(PancakeV3Adapter.name);
  private readonly metaCache = new Map<
    string,
    { symbol: string; decimals: number }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly priceService: PriceService,
  ) {}

  async claimedTokens(): Promise<string[]> {
    return [getAddress(this.npmAddress())];
  }

  async getPositions(vaultAddress: string): Promise<ValuedPosition[]> {
    const rpcUrl = this.config.get<string>('RPC_URL')!;
    const provider = new JsonRpcProvider(rpcUrl);
    try {
      const npm = new Contract(this.npmAddress(), NPM_ABI, provider);
      const factory = new Contract(this.factoryAddress(), FACTORY_ABI, provider);

      const count: bigint = await npm.balanceOf(vaultAddress);
      const positions: ValuedPosition[] = [];

      for (let i = 0n; i < count; i++) {
        let tokenId: bigint | null = null;
        try {
          const id = (await npm.tokenOfOwnerByIndex(
            vaultAddress,
            i,
          )) as bigint;
          tokenId = id;
          const raw = await this.readPosition(
            provider,
            npm,
            factory,
            vaultAddress,
            id,
          );
          if (raw) positions.push(buildLpPosition(raw));
        } catch (err) {
          this.logger.warn(
            `PCS position #${tokenId ?? i} read failed for ${vaultAddress}: ${err}`,
          );
          positions.push({
            protocol: 'pancakeswap-v3',
            kind: 'error',
            label: `LP position ${tokenId != null ? `#${tokenId}` : ''}`.trim(),
            legs: [],
            valueUsd: null,
            error: 'Failed to read LP position',
          });
        }
      }

      return positions;
    } finally {
      await provider.destroy();
    }
  }

  private async readPosition(
    provider: JsonRpcProvider,
    npm: Contract,
    factory: Contract,
    vaultAddress: string,
    tokenId: bigint,
  ): Promise<LpRawRead | null> {
    const pos = await npm.positions(tokenId);
    const liquidity: bigint = pos.liquidity;

    // Live uncollected fees via collect static-call (from: vault).
    const [fee0, fee1] = (await npm.collect.staticCall(
      {
        tokenId,
        recipient: vaultAddress,
        amount0Max: MAX_U128,
        amount1Max: MAX_U128,
      },
      { from: vaultAddress },
    )) as [bigint, bigint];

    // Skip fully-closed, fee-empty positions.
    if (liquidity === 0n && fee0 === 0n && fee1 === 0n) return null;

    const token0 = getAddress(pos.token0);
    const token1 = getAddress(pos.token1);
    const fee = Number(pos.fee);

    const poolAddr: string = await factory.getPool(token0, token1, fee);
    const pool = new Contract(poolAddr, POOL_ABI, provider);
    const slot0 = await pool.slot0();

    const [meta0, meta1, prices] = await Promise.all([
      this.tokenMeta(provider, token0),
      this.tokenMeta(provider, token1),
      this.priceService.getPrices([token0, token1]),
    ]);

    return {
      tokenId,
      token0,
      token1,
      fee,
      tickLower: Number(pos.tickLower),
      tickUpper: Number(pos.tickUpper),
      liquidity,
      sqrtPriceX96: slot0.sqrtPriceX96,
      currentTick: Number(slot0.tick),
      decimals0: meta0.decimals,
      symbol0: meta0.symbol,
      decimals1: meta1.decimals,
      symbol1: meta1.symbol,
      uncollected0: fee0,
      uncollected1: fee1,
      price0: prices.get(token0)?.priceUsd ?? null,
      price1: prices.get(token1)?.priceUsd ?? null,
    };
  }

  private async tokenMeta(
    provider: JsonRpcProvider,
    address: string,
  ): Promise<{ symbol: string; decimals: number }> {
    const cached = this.metaCache.get(address);
    if (cached) return cached;
    const c = new Contract(address, ERC20_META_ABI, provider);
    const [symbol, decimals] = await Promise.all([c.symbol(), c.decimals()]);
    const meta = { symbol: symbol as string, decimals: Number(decimals) };
    this.metaCache.set(address, meta);
    return meta;
  }

  private npmAddress(): string {
    return this.config.get<string>('PCS_NPM_ADDRESS') ?? DEFAULT_NPM;
  }

  private factoryAddress(): string {
    return this.config.get<string>('PCS_FACTORY_ADDRESS') ?? DEFAULT_FACTORY;
  }
}
