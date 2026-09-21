/**
 * Price-shock preview — the pure core.
 *
 * The slippage tolerance protects a single swap. It says nothing about what a
 * moving market does to the strategy as a whole, which is what the owner is
 * actually deciding about right before the deploy. This module answers that
 * question for the steps whose behaviour depends on a price:
 *
 *  - a **swap** reverts once the market has moved further against it than its
 *    tolerance allows *within its reference window* — the on-chain
 *    `SlippageGuard` prices the swap against the pool's time-weighted average
 *    over that window, so the window is part of the answer, not a detail,
 *  - an **LP range** stops earning once the price leaves its band,
 *  - a **lending** position's Health Factor scales with the collateral price.
 *
 * Everything here is a pure computation over data the caller already has: the
 * editor graph, the step schemas, and the figures the cockpit path delivers.
 * There is no fetching, no clock and no chain access — the on-chain pool state
 * a swap's depth needs is handed in, exactly as `pool-validity.ts` does it.
 *
 * Two rules shape the whole design:
 *
 *  1. **A missing preview never blocks a deploy.** Anything that cannot be
 *     computed becomes an `unavailable` row with a reason; it is never an
 *     error, and the caller keeps its deploy path open regardless.
 *  2. **No invented numbers.** Where an input is missing the answer is "not
 *     computable", never a plausible-looking default.
 */

import { zeroToggleField, type FieldSchema, type StepSchema } from 'shared';
import { tickDeltaToPct } from './ticks';

/**
 * The price moves the preview reports, in percent.
 *
 * Negative means the market moved against the step (a swap gets less out, a
 * collateral position is worth less); positive means it moved in its favour.
 */
export const SHOCK_PERCENTS = [-50, -20, -10, 10, 20, 50] as const;

export type ShockPercent = (typeof SHOCK_PERCENTS)[number];

/**
 * A tolerance this wide stops being protection: above it a swap still executes
 * after a market move that most owners would rather sit out. It is a display
 * threshold for the warning only — the binding limits live in the step schema.
 */
export const HIGH_TOLERANCE_BPS = 300;

/**
 * A swap taking this share of the liquidity active around the pool price moves
 * that price itself, so the fill is worse than the quoted reference suggests.
 */
export const THIN_POOL_SHARE = 0.02;

/** The editor node, narrowed to what the preview reads. */
export interface PreviewNode {
  id: string;
  data: {
    stepTypeId: string;
    stepTypeName: string;
    params: Record<string, unknown>;
  };
}

/** One pool a swap step routes through, named for the on-chain depth read. */
export interface SwapPool {
  nodeId: string;
  tokenIn: string;
  tokenOut: string;
  fee: number;
  /** Swap size in human units — null when it is "the whole balance" or a slot. */
  amountIn: number | null;
}

/** The pool depth of one swap, measured on-chain and handed in. */
export interface SwapDepth {
  /** Liquidity active around the pool price, as input-token units. */
  reserveIn: number;
}

/** What the cockpit path knows. Every field optional: missing data is normal. */
export interface PreviewMarketData {
  /**
   * Aave account health from the cockpit's `summary` position. `undefined`
   * means "not loaded"; a `null` health factor means "no debt, nothing to
   * shock" — the two read differently to the user and must stay apart.
   */
  lending?: { healthFactor: number | null };
  /** Depth per swap node id, for the pools `collectSwapPools` named. */
  depthByNode?: Record<string, SwapDepth | undefined>;
}

export type UnavailableReason =
  | 'no-tolerance'
  | 'explicit-range'
  | 'no-lending-data'
  | 'no-lending-position';

export interface SwapRow {
  kind: 'swap';
  nodeId: string;
  stepName: string;
  /** The step's own tolerance, as a ratio (0.01 = 1 %). */
  tolerance: number;
  /**
   * The bound that actually applies when the pool's oracle cannot serve the
   * window: `SlippageGuard` then prices against the spot price and HALVES the
   * tolerance (integer bps division, mirrored here). A swap can therefore
   * revert at this smaller number, which is why the row carries it.
   */
  fallbackTolerance: number;
  /**
   * The reference window in seconds, from the step's own `twap-window` field.
   * `null` when the step has no such field or has not been given a value —
   * the row is then stated without a window rather than with a guessed one.
   */
  twapWindowSeconds: number | null;
  /** Share of the pool's active liquidity this swap consumes — null: unknown. */
  poolShare: number | null;
  outcomes: { shockPercent: ShockPercent; executes: boolean }[];
}

export interface RangeRow {
  kind: 'lp-range';
  nodeId: string;
  stepName: string;
  /** Band above the pool price, as a ratio. Ticks are symmetric, prices are not… */
  widthUp: number;
  /** …so the band below the price is the slightly smaller number. */
  widthDown: number;
  outcomes: { shockPercent: ShockPercent; inRange: boolean }[];
}

export interface HealthRow {
  kind: 'lending-health';
  nodeId: string;
  stepName: string;
  /**
   * The vault's Health Factor as the cockpit measured it — the position as it
   * stands NOW, before this automation has ever run. It is a measurement of
   * the present, not a projection of the deploy, and the panel has to say so.
   */
  healthFactor: number;
  /**
   * The Health Factor this step steers towards, when it is configured to steer
   * at all (Aave TARGET_HF mode); `null` otherwise. It is deliberately not
   * folded into `healthFactor` or the outcomes: the step moves the position
   * only when its condition fires, at a price nobody knows yet, so a combined
   * number would be exactly the invented figure this module refuses to print.
   */
  targetHealthFactor: number | null;
  outcomes: {
    shockPercent: ShockPercent;
    healthFactor: number;
    liquidatable: boolean;
  }[];
}

export interface UnavailableRow {
  kind: 'unavailable';
  nodeId: string;
  stepName: string;
  reason: UnavailableReason;
}

export type PreviewRow = SwapRow | RangeRow | HealthRow | UnavailableRow;

export type PreviewWarning =
  | { kind: 'high-tolerance'; nodeId: string; stepName: string; tolerance: number }
  | { kind: 'thin-pool'; nodeId: string; stepName: string; poolShare: number };

export interface PriceShockPreview {
  rows: PreviewRow[];
  warnings: PreviewWarning[];
}

function fieldByWidget(
  schema: StepSchema | undefined,
  widget: string,
): [string, FieldSchema] | undefined {
  const properties = schema?.paramSchema?.properties ?? {};
  return Object.entries(properties).find(
    ([, field]) => field['x-ui-widget'] === widget,
  );
}

function fieldsByWidget(
  schema: StepSchema | undefined,
  widget: string,
): string[] {
  const properties = schema?.paramSchema?.properties ?? {};
  return Object.entries(properties)
    .filter(([, field]) => field['x-ui-widget'] === widget)
    .map(([name]) => name);
}

/**
 * The catalog's "no slot" sentinel for every `context-slot` field: max uint32.
 * Anything below it names an actual slot.
 */
export const UNSET_CONTEXT_SLOT = 4_294_967_295;

/** A finite number from a param that may be a string, a number or nothing. */
function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Whether this step takes its input amount from a context slot instead of the
 * amount field.
 *
 * On chain the slot wins: when it is set, the amount field is ignored and the
 * real size is whatever an earlier step wrote — a figure that does not exist
 * until the automation runs. A preview computed from the amount field would
 * therefore be a number about a swap that never happens, which is worse than
 * no number at all.
 *
 * The slot that belongs to an amount field is named `<amount>FromSlot` in the
 * catalog. Where a step does not follow that convention, any read slot being
 * set is taken as enough doubt to drop the size — unknown beats wrong.
 */
function amountComesFromSlot(
  schema: StepSchema | undefined,
  params: Record<string, unknown>,
  amountField: string,
): boolean {
  const properties = schema?.paramSchema?.properties ?? {};
  // 'read-write' reads too — the catalog uses it for slots a step both consumes
  // and updates. Counting only 'read' would leave exactly the wrong number on
  // screen for those three fields, which is the bug this check exists to avoid.
  const readSlots = Object.entries(properties).filter(
    ([, field]) =>
      field['x-ui-widget'] === 'context-slot' &&
      (field['x-ui-slot-access'] === 'read' ||
        field['x-ui-slot-access'] === 'read-write'),
  );
  const conventional = readSlots.filter(
    ([name]) => name === `${amountField}FromSlot`,
  );
  const relevant = conventional.length > 0 ? conventional : readSlots;

  return relevant.some(([name]) => {
    const slot = numeric(params[name]);
    return slot !== null && slot >= 0 && slot < UNSET_CONTEXT_SLOT;
  });
}

/**
 * Liquidity active around the pool price, expressed as units of one side.
 *
 * A PancakeSwap V3 pool holds `L` of liquidity at price `sqrtP²`; the virtual
 * reserves of that liquidity are `L / sqrtP` of token0 and `L · sqrtP` of
 * token1 (raw units). Comparing a swap against the side it pays in is what
 * tells an owner whether the swap is small for this pool or is the market.
 */
export function activeReserve(
  sqrtPriceX96: bigint,
  liquidity: bigint,
  inputIsToken0: boolean,
  inputDecimals: number,
): number | null {
  const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
  const pooled = Number(liquidity);
  if (!(sqrtPrice > 0) || !Number.isFinite(sqrtPrice)) return null;
  if (!(pooled > 0) || !Number.isFinite(pooled)) return null;
  const raw = inputIsToken0 ? pooled / sqrtPrice : pooled * sqrtPrice;
  const reserve = raw / 10 ** inputDecimals;
  return Number.isFinite(reserve) ? reserve : null;
}

/**
 * The pools whose depth the preview would like to know: one per swap step with
 * both tokens and a fee tier chosen. `amountIn` is null whenever the size is
 * not knowable before execution (full balance, or read from a context slot).
 */
export function collectSwapPools(
  nodes: PreviewNode[],
  stepSchemas: Record<string, StepSchema>,
): SwapPool[] {
  const pools: SwapPool[] = [];
  for (const node of nodes) {
    const schema = stepSchemas[node.data.stepTypeId];
    if (!fieldByWidget(schema, 'slippage-tolerance')) continue;
    const feeField = fieldByWidget(schema, 'fee-tier')?.[0];
    const [tokenInField, tokenOutField] = fieldsByWidget(schema, 'token-selector');
    if (!feeField || !tokenInField || !tokenOutField) continue;

    const params = node.data.params;
    const tokenIn = params[tokenInField];
    const tokenOut = params[tokenOutField];
    const fee = numeric(params[feeField]);
    if (typeof tokenIn !== 'string' || !tokenIn) continue;
    if (typeof tokenOut !== 'string' || !tokenOut) continue;
    if (fee === null) continue;

    const amountEntry = Object.entries(schema?.paramSchema?.properties ?? {}).find(
      ([, field]) =>
        field['x-ui-widget'] === 'token-amount' &&
        field['x-ui-amount-token-field'] === tokenInField,
    );
    let amountIn: number | null = null;
    if (amountEntry) {
      const [amountField] = amountEntry;
      // Two ways for the size to be unknowable before the run, treated alike:
      // the whole-balance toggle, and an amount read from a context slot.
      const sizeUnknown =
        params[zeroToggleField(amountField)] === true ||
        amountComesFromSlot(schema, params, amountField);
      amountIn = sizeUnknown ? null : numeric(params[amountField]);
      if (amountIn !== null && amountIn <= 0) amountIn = null;
    }

    pools.push({ nodeId: node.id, tokenIn, tokenOut, fee, amountIn });
  }
  return pools;
}

/** What one on-chain pool read has to answer for the depth to be computable. */
export interface PoolState {
  sqrtPriceX96: bigint;
  liquidity: bigint;
}

/**
 * Turn the pools of a graph into per-node depth, with the chain read injected
 * (the hook passes a viem call, a test passes a fake).
 *
 * Every read stands alone: one pool that cannot be read leaves that one swap
 * without a depth figure and says nothing about the others — and never throws,
 * because the only thing worse than a missing preview is a blocked deploy.
 */
export async function readSwapDepths(
  pools: SwapPool[],
  decimalsByToken: Record<string, number>,
  readPool: (pool: SwapPool) => Promise<PoolState | null>,
): Promise<Record<string, SwapDepth | undefined>> {
  const depths: Record<string, SwapDepth | undefined> = {};
  for (const pool of pools) {
    // Without a size there is nothing to compare the depth against, and an
    // unknown decimals count would turn the reserve into a made-up number.
    const decimals = decimalsByToken[pool.tokenIn.toLowerCase()];
    if (pool.amountIn === null || typeof decimals !== 'number') continue;
    try {
      const state = await readPool(pool);
      if (!state) continue;
      const inputIsToken0 =
        pool.tokenIn.toLowerCase() < pool.tokenOut.toLowerCase();
      const reserveIn = activeReserve(
        state.sqrtPriceX96,
        state.liquidity,
        inputIsToken0,
        decimals,
      );
      if (reserveIn !== null) depths[pool.nodeId] = { reserveIn };
    } catch {
      // A pool that will not answer simply has no depth figure.
    }
  }
  return depths;
}

function swapRow(
  node: PreviewNode,
  toleranceBps: number,
  depth: SwapDepth | undefined,
  amountIn: number | null,
  twapWindowSeconds: number | null,
): SwapRow {
  const tolerance = toleranceBps / 10_000;
  // `SlippageGuard` halves the tolerance in bps with integer division, so 25
  // bps becomes 12, not 12.5. Rounding it any other way here would print a
  // bound the contract never enforces.
  const fallbackTolerance = Math.floor(toleranceBps / 2) / 10_000;
  const poolShare =
    depth && amountIn !== null && depth.reserveIn > 0
      ? amountIn / depth.reserveIn
      : null;
  return {
    kind: 'swap',
    nodeId: node.id,
    stepName: node.data.stepTypeName,
    tolerance,
    fallbackTolerance,
    // A window that is missing, unparseable or not a positive number is no
    // window: the row says nothing about it rather than something wrong.
    twapWindowSeconds:
      twapWindowSeconds !== null && twapWindowSeconds > 0 ? twapWindowSeconds : null,
    poolShare,
    outcomes: SHOCK_PERCENTS.map((shockPercent) => ({
      shockPercent,
      // A move in the swap's favour never trips the guard; a move against it
      // does as soon as it exceeds the tolerance — measured against the pool's
      // average price over the reference window. A market that takes longer
      // than that window to travel the same distance carries the average with
      // it, and the swap fills at the new, worse price instead. Every outcome
      // here is therefore a statement about a move *within* that window, and
      // the panel says so next to the row.
      executes: shockPercent > 0 || Math.abs(shockPercent) / 100 <= tolerance,
    })),
  };
}

/**
 * Rounds to the precision the preview prints (two decimals of a percent).
 *
 * A band is built from whole ticks, so a "±10 %" preset is really ±9.9995 %.
 * Comparing at full precision would put a 10 % move out of a band the very
 * same panel labels 10.00 % — a contradiction the reader cannot resolve. Both
 * sides are therefore compared as they are shown.
 */
function atShownPrecision(ratio: number): number {
  return Math.round(ratio * 1e4) / 1e4;
}

function rangeRow(node: PreviewNode, tickDelta: number): RangeRow {
  const widthUp = tickDeltaToPct(tickDelta) / 100;
  // The band is symmetric in ticks, so in prices the lower half is narrower:
  // +10 % up is −9.09 % down. Saying "±10 %" would overstate the downside.
  const widthDown = 1 - 1 / (1 + widthUp);
  return {
    kind: 'lp-range',
    nodeId: node.id,
    stepName: node.data.stepTypeName,
    widthUp,
    widthDown,
    outcomes: SHOCK_PERCENTS.map((shockPercent) => ({
      shockPercent,
      inRange:
        atShownPrecision(Math.abs(shockPercent) / 100) <=
        atShownPrecision(shockPercent > 0 ? widthUp : widthDown),
    })),
  };
}

/** Aave's `TARGET_HF` amount mode — the only one that uses the target field. */
const TARGET_HF_MODE = 3;

/**
 * The Health Factor this step aims at, or `null` when it aims at nothing.
 *
 * The target field sits in all four Aave steps but only means something in
 * TARGET_HF mode; in every other mode the catalog leaves it at its default.
 * Reading it unconditionally would print a target the step will never pursue.
 */
function stepTargetHealthFactor(
  schema: StepSchema | undefined,
  params: Record<string, unknown>,
): number | null {
  const modeField = fieldByWidget(schema, 'aave-amount-mode');
  if (!modeField) return null;
  const [modeName, modeSchema] = modeField;
  if (numeric(params[modeName]) !== TARGET_HF_MODE) return null;

  const targetField = modeSchema['x-ui-target-hf-field'] as string | undefined;
  if (!targetField) return null;
  const target = numeric(params[targetField]);
  return target !== null && target > 0 ? target : null;
}

function healthRow(
  node: PreviewNode,
  healthFactor: number,
  targetHealthFactor: number | null,
): HealthRow {
  return {
    kind: 'lending-health',
    nodeId: node.id,
    stepName: node.data.stepTypeName,
    healthFactor,
    targetHealthFactor,
    outcomes: SHOCK_PERCENTS.map((shockPercent) => {
      // Collateral moves against the debt, the debt itself stays put: the
      // Health Factor is collateral × threshold ÷ debt, so it scales with the
      // collateral price one to one.
      const shocked = healthFactor * (1 + shockPercent / 100);
      return { shockPercent, healthFactor: shocked, liquidatable: shocked < 1 };
    }),
  };
}

/**
 * The preview for one graph: a row per step with price exposure, in graph
 * order, plus the warnings worth reading before signing.
 *
 * Steps without price exposure produce no row at all — silence is the honest
 * answer there, not a row full of zeroes.
 */
export function buildPriceShockPreview(
  nodes: PreviewNode[],
  stepSchemas: Record<string, StepSchema>,
  market: PreviewMarketData = {},
): PriceShockPreview {
  const rows: PreviewRow[] = [];
  const warnings: PreviewWarning[] = [];
  const pools = new Map(collectSwapPools(nodes, stepSchemas).map((p) => [p.nodeId, p]));

  for (const node of nodes) {
    const schema = stepSchemas[node.data.stepTypeId];
    const stepName = node.data.stepTypeName;
    const params = node.data.params;

    const toleranceField = fieldByWidget(schema, 'slippage-tolerance');
    if (toleranceField) {
      const toleranceBps = numeric(params[toleranceField[0]]);
      if (toleranceBps === null || toleranceBps <= 0) {
        rows.push({ kind: 'unavailable', nodeId: node.id, stepName, reason: 'no-tolerance' });
        continue;
      }
      const pool = pools.get(node.id);
      const windowField = fieldByWidget(schema, 'twap-window');
      const row = swapRow(
        node,
        toleranceBps,
        market.depthByNode?.[node.id],
        pool?.amountIn ?? null,
        windowField ? numeric(params[windowField[0]]) : null,
      );
      rows.push(row);
      if (toleranceBps >= HIGH_TOLERANCE_BPS) {
        warnings.push({
          kind: 'high-tolerance',
          nodeId: node.id,
          stepName,
          tolerance: row.tolerance,
        });
      }
      if (row.poolShare !== null && row.poolShare >= THIN_POOL_SHARE) {
        warnings.push({
          kind: 'thin-pool',
          nodeId: node.id,
          stepName,
          poolShare: row.poolShare,
        });
      }
      continue;
    }

    const rangeField = fieldByWidget(schema, 'tick-range');
    if (rangeField) {
      const [rangeName, rangeSchema] = rangeField;
      const deltaField = (rangeSchema['x-ui-tick-delta-field'] as string) ?? 'tickDelta';
      const mode = numeric(params[rangeName]);
      const tickDelta = numeric(params[deltaField]);
      // Mode 1 states the band as a width around the pool price — that alone
      // decides how far the price may move. An explicit min/max range would
      // need the current pool price to be placed, and guessing it is exactly
      // the invented number this preview refuses to show.
      if (mode !== 1 || tickDelta === null || tickDelta <= 0) {
        rows.push({ kind: 'unavailable', nodeId: node.id, stepName, reason: 'explicit-range' });
        continue;
      }
      rows.push(rangeRow(node, tickDelta));
      continue;
    }

    if (fieldByWidget(schema, 'health-factor')) {
      const lending = market.lending;
      if (!lending) {
        rows.push({ kind: 'unavailable', nodeId: node.id, stepName, reason: 'no-lending-data' });
        continue;
      }
      const healthFactor = lending.healthFactor;
      if (healthFactor === null || !Number.isFinite(healthFactor) || healthFactor <= 0) {
        rows.push({
          kind: 'unavailable',
          nodeId: node.id,
          stepName,
          reason: 'no-lending-position',
        });
        continue;
      }
      rows.push(
        healthRow(node, healthFactor, stepTargetHealthFactor(schema, params)),
      );
    }
  }

  return { rows, warnings };
}
