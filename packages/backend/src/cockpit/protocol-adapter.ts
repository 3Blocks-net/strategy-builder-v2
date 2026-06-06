/**
 * The Vault-Cockpit protocol-adapter seam (PRD: Modules → ProtocolAdapter).
 *
 * Every protocol (Aave V3, PancakeSwap V3, …) implements this one narrow
 * interface; `ValuationService` iterates the registered adapters generically so
 * a new protocol appears in positions / snapshots / PnL without touching the
 * views or the valuation pipeline.
 *
 * Slice #01 (cockpit spine) defines the contract + the `ValuedPosition` shape
 * and ships an empty adapter set; the Aave/PCS adapters arrive in #02/#03.
 */

/** One token leg of a position (a supplied/borrowed/idle/LP token amount). */
export interface PositionLeg {
  /** Token contract address (checksummed). */
  token: string;
  symbol: string;
  decimals: number;
  /** Amount in base units (decimal string — never a float). */
  amount: string;
  /** USD value of this leg, or null when no price is available. */
  amountUsd: number | null;
  /** A debt leg subtracts from net equity (e.g. an Aave variable-debt balance). */
  isDebt?: boolean;
}

/**
 * A protocol-agnostic, USD-valued position. The cockpit views, the snapshot
 * cron, and PnL only ever see this — never protocol specifics. `valueUsd` is the
 * position's contribution to **net equity** (debt legs already subtracted).
 */
export interface ValuedPosition {
  /** e.g. 'idle' | 'gas-reserve' | 'aave-v3' | 'pancakeswap-v3'. */
  protocol: string;
  /** e.g. 'token' | 'supply' | 'borrow' | 'lp' | 'gas-reserve'. */
  kind: string;
  label: string;
  legs: PositionLeg[];
  /** Net USD contribution (debt subtracted); null when unpriceable. */
  valueUsd: number | null;
  /** Borrowed USD, when the position carries debt (informational). */
  debtUsd?: number;
  /** Accrued earnings USD (arrives with the Aave earnings slice #08). */
  earningsUsd?: number | null;
  /** Protocol-specific extras (health factor, LP range, APY, …). */
  metrics?: Record<string, unknown>;
  /**
   * Per-position read isolation (PRD: a broken position must not crash the
   * panel). When set, this position failed to read and renders as an error row.
   */
  error?: string;
}

/** The fully-valued vault — the single source of truth for every cockpit view. */
export interface ValuedVault {
  vaultAddress: string;
  positions: ValuedPosition[];
  /** Sum of position `valueUsd` (net equity). */
  totalValueUsd: number;
  /** Block the reads were taken at, when known. */
  asOfBlock: number | null;
  /** ISO timestamp of the valuation. */
  asOf: string;
}

/** A protocol adapter — implemented once per integrated protocol. */
export interface ProtocolAdapter {
  /** Stable protocol id, e.g. 'aave-v3'. */
  readonly protocol: string;

  /** Read + value the vault's positions for this protocol. */
  getPositions(vaultAddress: string): Promise<ValuedPosition[]>;

  /**
   * Token addresses this adapter "owns" (aTokens, debt tokens, LP NFT manager).
   * `ValuationService` subtracts these from the idle list so a supplied aToken
   * isn't counted twice (PRD: Resolved decision 1).
   */
  claimedTokens(vaultAddress: string): Promise<string[]>;
}

/** DI token for the array of registered protocol adapters. */
export const PROTOCOL_ADAPTERS = Symbol('PROTOCOL_ADAPTERS');
