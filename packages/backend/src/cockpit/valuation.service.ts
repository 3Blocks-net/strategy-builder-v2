import { Inject, Injectable, Logger } from '@nestjs/common';
import { VaultPortfolioService } from '../portfolio/vault-portfolio.service';
import { PriceService } from '../portfolio/price.service';
import { FeeService } from '../blockchain/fee.service';
import {
  PROTOCOL_ADAPTERS,
  ProtocolAdapter,
  ValuedPosition,
  ValuedVault,
} from './protocol-adapter';

const CACHE_TTL_MS = 30 * 1000;

/**
 * The cockpit's single source of truth (PRD: Modules → ValuationService).
 *
 * Turns a vault address into a fully-valued, net-equity result: idle ERC-20s
 * (minus any adapter-claimed token) + every registered protocol adapter's
 * positions + the gas-comp reserve. Both the live `/positions` path and (later)
 * the snapshot cron call this one service, so the header, chart, and PnL can
 * never disagree.
 *
 * Slice #01 ships with an empty adapter set → idle + gas reserve only.
 */
@Injectable()
export class ValuationService {
  private readonly logger = new Logger(ValuationService.name);
  private readonly cache = new Map<
    string,
    { data: ValuedVault; expiresAt: number }
  >();

  constructor(
    private readonly portfolio: VaultPortfolioService,
    private readonly priceService: PriceService,
    private readonly feeService: FeeService,
    @Inject(PROTOCOL_ADAPTERS)
    private readonly adapters: ProtocolAdapter[],
  ) {}

  /**
   * Value a vault. `refresh` bypasses the short-TTL cache for an on-demand
   * live recompute.
   */
  async valueVault(
    vaultAddress: string,
    opts: { refresh?: boolean } = {},
  ): Promise<ValuedVault> {
    const cached = this.cache.get(vaultAddress);
    if (!opts.refresh && cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // 1. Each adapter is isolated — a broken protocol never kills the cockpit.
    const claimed = new Set<string>();
    const adapterPositions: ValuedPosition[] = [];
    for (const adapter of this.adapters) {
      try {
        const tokens = await adapter.claimedTokens(vaultAddress);
        for (const t of tokens) claimed.add(t.toLowerCase());
      } catch (err) {
        this.logger.warn(
          `${adapter.protocol} claimedTokens failed for ${vaultAddress}: ${err}`,
        );
      }
      try {
        adapterPositions.push(...(await adapter.getPositions(vaultAddress)));
      } catch (err) {
        this.logger.warn(
          `${adapter.protocol} getPositions failed for ${vaultAddress}: ${err}`,
        );
        adapterPositions.push({
          protocol: adapter.protocol,
          kind: 'error',
          label: adapter.protocol,
          legs: [],
          valueUsd: null,
          error: `Failed to read ${adapter.protocol} positions`,
        });
      }
    }

    // 2. Idle ERC-20s (minus adapter-claimed tokens → no double-count).
    const idlePositions = await this.idlePositions(vaultAddress, claimed);

    // 3. Gas-comp reserve as a position (so top-ups aren't seen as a loss).
    const gasPosition = await this.gasReservePosition(vaultAddress);

    const positions = [
      ...idlePositions,
      ...(gasPosition ? [gasPosition] : []),
      ...adapterPositions,
    ];

    const totalValueUsd = positions.reduce(
      (sum, p) => sum + (p.valueUsd ?? 0),
      0,
    );

    const result: ValuedVault = {
      vaultAddress,
      positions,
      totalValueUsd,
      asOfBlock: null,
      asOf: new Date().toISOString(),
    };

    this.cache.set(vaultAddress, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return result;
  }

  /** Idle token balances, excluding anything an adapter claims. */
  private async idlePositions(
    vaultAddress: string,
    claimed: Set<string>,
  ): Promise<ValuedPosition[]> {
    try {
      const portfolio = await this.portfolio.getPortfolio(vaultAddress);
      return portfolio.positions
        .filter((p) => !claimed.has(p.address.toLowerCase()))
        .map((p) => ({
          protocol: 'idle',
          kind: 'token',
          label: p.symbol,
          legs: [
            {
              token: p.address,
              symbol: p.symbol,
              decimals: p.decimals,
              amount: p.balance,
              amountUsd: p.valueUsd,
            },
          ],
          valueUsd: p.valueUsd,
        }));
    } catch (err) {
      this.logger.warn(`idle positions failed for ${vaultAddress}: ${err}`);
      return [
        {
          protocol: 'idle',
          kind: 'error',
          label: 'Idle balances',
          legs: [],
          valueUsd: null,
          error: 'Failed to read idle balances',
        },
      ];
    }
  }

  /** The vault's FeeRegistry gas-comp pre-funding, valued in USD. */
  private async gasReservePosition(
    vaultAddress: string,
  ): Promise<ValuedPosition | null> {
    try {
      const gas = await this.feeService.getVaultGasDeposit(vaultAddress);
      if (!gas.enabled || !gas.token || gas.deposited === '0') return null;

      const prices = await this.priceService.getPrices([gas.token.address]);
      const price = prices.get(gas.token.address)?.priceUsd ?? null;
      const human = Number(gas.deposited) / 10 ** gas.token.decimals;
      const valueUsd = price != null ? human * price : null;

      return {
        protocol: 'gas-reserve',
        kind: 'gas-reserve',
        label: 'Gas reserve',
        legs: [
          {
            token: gas.token.address,
            symbol: gas.token.symbol,
            decimals: gas.token.decimals,
            amount: gas.deposited,
            amountUsd: valueUsd,
          },
        ],
        valueUsd,
      };
    } catch (err) {
      this.logger.warn(`gas reserve failed for ${vaultAddress}: ${err}`);
      return {
        protocol: 'gas-reserve',
        kind: 'error',
        label: 'Gas reserve',
        legs: [],
        valueUsd: null,
        error: 'Failed to read gas reserve',
      };
    }
  }
}
