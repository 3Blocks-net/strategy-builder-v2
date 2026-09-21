import { describe, expect, it, vi } from 'vitest';
import type { StepSchema } from 'shared';
import {
  activeReserve,
  buildPriceShockPreview,
  collectSwapPools,
  readSwapDepths,
  HIGH_TOLERANCE_BPS,
  UNSET_CONTEXT_SLOT,
  type PreviewNode,
  type PreviewRow,
  type SwapRow,
  type RangeRow,
  type HealthRow,
} from '../price-shock';
import { presetTickDelta } from '../ticks';

const TOKEN_IN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_OUT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/** The catalog's swap step, reduced to the fields the preview reads. */
const SWAP_SCHEMA: StepSchema = {
  paramSchema: {
    type: 'object',
    properties: {
      tokenIn: { type: 'string', 'x-ui-widget': 'token-selector' },
      tokenOut: { type: 'string', 'x-ui-widget': 'token-selector' },
      fee: { type: 'integer', 'x-ui-widget': 'fee-tier' },
      amountIn: {
        type: 'string',
        'x-ui-widget': 'token-amount',
        'x-ui-amount-token-field': 'tokenIn',
        'x-ui-zero-toggle': { default: false },
      },
      amountInFromSlot: {
        type: 'integer',
        'x-ui-widget': 'context-slot',
        'x-ui-slot-access': 'read',
        default: 4294967295,
      },
      amountOutToSlot: {
        type: 'integer',
        'x-ui-widget': 'context-slot',
        'x-ui-slot-access': 'write',
        default: 4294967295,
      },
      slippageToleranceBps: {
        type: 'integer',
        'x-ui-widget': 'slippage-tolerance',
        minimum: 10,
        maximum: 1000,
      },
      twapWindow: {
        type: 'integer',
        'x-ui-widget': 'twap-window',
        minimum: 60,
        maximum: 900,
      },
    },
  },
};

const LP_SCHEMA: StepSchema = {
  paramSchema: {
    type: 'object',
    properties: {
      rangeMode: {
        type: 'integer',
        'x-ui-widget': 'tick-range',
        'x-ui-tick-delta-field': 'tickDelta',
      },
      tickDelta: { type: 'integer' },
      tickLower: { type: 'integer' },
      tickUpper: { type: 'integer' },
    },
  },
};

const AAVE_SCHEMA: StepSchema = {
  paramSchema: {
    type: 'object',
    properties: {
      asset: { type: 'string', 'x-ui-widget': 'token-selector' },
      mode: {
        type: 'integer',
        'x-ui-widget': 'aave-amount-mode',
        'x-ui-target-hf-field': 'targetHealthFactor',
      },
      targetHealthFactor: { type: 'string', 'x-ui-widget': 'health-factor' },
    },
  },
};

const TIMER_SCHEMA: StepSchema = {
  paramSchema: {
    type: 'object',
    properties: { delta: { type: 'integer', 'x-ui-widget': 'duration' } },
  },
};

const schemas: Record<string, StepSchema> = {
  swap: SWAP_SCHEMA,
  lp: LP_SCHEMA,
  aave: AAVE_SCHEMA,
  timer: TIMER_SCHEMA,
};

function node(
  id: string,
  stepTypeId: string,
  params: Record<string, unknown>,
): PreviewNode {
  return {
    id,
    data: { stepTypeId, stepTypeName: `${stepTypeId} step`, params },
  };
}

const swapNode = (params: Record<string, unknown> = {}) =>
  node('s1', 'swap', {
    tokenIn: TOKEN_IN,
    tokenOut: TOKEN_OUT,
    fee: 500,
    amountIn: '10',
    // The catalog default: max uint32 means "no slot", the amount field wins.
    amountInFromSlot: 4294967295,
    amountOutToSlot: 4294967295,
    slippageToleranceBps: 100,
    twapWindow: 300,
    ...params,
  });

const lpNode = (params: Record<string, unknown> = {}) =>
  node('l1', 'lp', { rangeMode: 1, tickDelta: presetTickDelta(10), ...params });

const aaveNode = (params: Record<string, unknown> = {}) =>
  node('a1', 'aave', {
    asset: TOKEN_IN,
    mode: 3, // TARGET_HF — the only mode in which the target field means anything
    targetHealthFactor: '1.6',
    ...params,
  });

function rowFor<T extends PreviewRow>(rows: PreviewRow[], nodeId: string): T {
  const row = rows.find((r) => r.nodeId === nodeId);
  if (!row) throw new Error(`no row for ${nodeId}`);
  return row as T;
}

const outcomeAt = <O extends { shockPercent: number }>(
  row: { outcomes: O[] },
  shock: number,
): O => {
  const outcome = row.outcomes.find((o) => o.shockPercent === shock);
  if (!outcome) throw new Error(`no outcome for ${shock}`);
  return outcome;
};

describe('a swap under a price shock', () => {
  it('keeps running while the move stays inside its tolerance', () => {
    const { rows } = buildPriceShockPreview(
      [swapNode({ slippageToleranceBps: 1000 })],
      schemas,
    );
    const row = rowFor<SwapRow>(rows, 's1');

    expect(row.kind).toBe('swap');
    expect(row.tolerance).toBe(0.1);
    expect(outcomeAt(row, -10)).toMatchObject({ executes: true });
  });

  it('states the reference window its outcomes are measured over', () => {
    const { rows } = buildPriceShockPreview([swapNode({ twapWindow: 600 })], schemas);

    expect(rowFor<SwapRow>(rows, 's1').twapWindowSeconds).toBe(600);
  });

  it('has no window to state when the step carries none', () => {
    const { rows } = buildPriceShockPreview(
      [swapNode({ twapWindow: undefined })],
      schemas,
    );

    expect(rowFor<SwapRow>(rows, 's1').twapWindowSeconds).toBeNull();
  });

  it('carries the halved bound that applies when the oracle misses the window', () => {
    const { rows } = buildPriceShockPreview(
      [swapNode({ slippageToleranceBps: 100 })],
      schemas,
    );
    const row = rowFor<SwapRow>(rows, 's1');

    expect(row.tolerance).toBe(0.01);
    expect(row.fallbackTolerance).toBe(0.005);
  });

  it('halves an odd tolerance the way the contract does, not the way maths would', () => {
    const { rows } = buildPriceShockPreview(
      [swapNode({ slippageToleranceBps: 25 })],
      schemas,
    );

    // 25 bps / 2 is 12 bps on-chain, never 12.5.
    expect(rowFor<SwapRow>(rows, 's1').fallbackTolerance).toBe(0.0012);
  });

  it('reverts instead of filling once the market moved further than the tolerance', () => {
    const { rows } = buildPriceShockPreview([swapNode()], schemas);
    const row = rowFor<SwapRow>(rows, 's1');

    expect(outcomeAt(row, -10)).toMatchObject({ executes: false });
    expect(outcomeAt(row, -20)).toMatchObject({ executes: false });
    expect(outcomeAt(row, -50)).toMatchObject({ executes: false });
  });

  it('never fails on a move in the swap’s favour', () => {
    const { rows } = buildPriceShockPreview([swapNode()], schemas);
    const row = rowFor<SwapRow>(rows, 's1');

    for (const shock of [10, 20, 50]) {
      expect(outcomeAt(row, shock)).toMatchObject({ executes: true });
    }
  });

  it('reports every listed move, both directions', () => {
    const { rows } = buildPriceShockPreview([swapNode()], schemas);

    expect(rowFor<SwapRow>(rows, 's1').outcomes.map((o) => o.shockPercent)).toEqual([
      -50, -20, -10, 10, 20, 50,
    ]);
  });

  it('warns about a tolerance wide enough to stop being protection', () => {
    const { warnings } = buildPriceShockPreview(
      [swapNode({ slippageToleranceBps: HIGH_TOLERANCE_BPS })],
      schemas,
    );

    expect(warnings).toEqual([
      { kind: 'high-tolerance', nodeId: 's1', stepName: 'swap step', tolerance: 0.03 },
    ]);
  });

  it('stays quiet about a tolerance in the normal band', () => {
    const { warnings } = buildPriceShockPreview([swapNode()], schemas);

    expect(warnings).toEqual([]);
  });

  it('says "not computable" rather than assuming a tolerance', () => {
    const { rows } = buildPriceShockPreview(
      [swapNode({ slippageToleranceBps: undefined })],
      schemas,
    );

    expect(rows).toEqual([
      { kind: 'unavailable', nodeId: 's1', stepName: 'swap step', reason: 'no-tolerance' },
    ]);
  });
});

describe('how big the swap is for its pool', () => {
  it('warns when the swap eats a large share of the liquidity around the price', () => {
    const { rows, warnings } = buildPriceShockPreview([swapNode()], schemas, {
      depthByNode: { s1: { reserveIn: 100 } },
    });

    expect(rowFor<SwapRow>(rows, 's1').poolShare).toBeCloseTo(0.1, 10);
    expect(warnings).toEqual([
      { kind: 'thin-pool', nodeId: 's1', stepName: 'swap step', poolShare: 0.1 },
    ]);
  });

  it('stays quiet when the swap is small against the pool', () => {
    const { rows, warnings } = buildPriceShockPreview([swapNode()], schemas, {
      depthByNode: { s1: { reserveIn: 100_000 } },
    });

    expect(rowFor<SwapRow>(rows, 's1').poolShare).toBeCloseTo(0.0001, 10);
    expect(warnings).toEqual([]);
  });

  it('leaves the share unknown when the pool could not be read', () => {
    const { rows, warnings } = buildPriceShockPreview([swapNode()], schemas);

    expect(rowFor<SwapRow>(rows, 's1').poolShare).toBeNull();
    expect(warnings).toEqual([]);
  });

  it('leaves the share unknown when the swap spends the whole balance', () => {
    const { rows } = buildPriceShockPreview(
      [swapNode({ amountIn_useZero: true })],
      schemas,
      { depthByNode: { s1: { reserveIn: 100 } } },
    );

    expect(rowFor<SwapRow>(rows, 's1').poolShare).toBeNull();
  });

  it('computes no share for a swap whose amount comes from a slot', () => {
    // 10 against a reserve of 100 would read as a 10 % share and raise a
    // thin-pool warning — about an amount this swap will never use.
    const { rows, warnings } = buildPriceShockPreview(
      [swapNode({ amountInFromSlot: 1 })],
      schemas,
      { depthByNode: { s1: { reserveIn: 100 } } },
    );

    expect(rowFor<SwapRow>(rows, 's1').poolShare).toBeNull();
    expect(warnings.filter((w) => w.kind === 'thin-pool')).toEqual([]);
  });

  it("treats a read-write slot as a slot too — the catalog uses both", () => {
    // Three catalog fields carry 'read-write'. A slot that a step both reads and
    // updates still supplies the amount, so counting only 'read' would put the
    // wrong number on screen for exactly those.
    const readWriteSchemas = structuredClone(schemas);
    const slotField =
      readWriteSchemas.swap.paramSchema?.properties?.amountInFromSlot;
    if (!slotField) throw new Error('fixture lost its slot field');
    slotField['x-ui-slot-access'] = 'read-write';

    const { rows, warnings } = buildPriceShockPreview(
      [swapNode({ amountInFromSlot: 1 })],
      readWriteSchemas,
      { depthByNode: { s1: { reserveIn: 100 } } },
    );

    expect(rowFor<SwapRow>(rows, 's1').poolShare).toBeNull();
    expect(warnings.filter((w) => w.kind === 'thin-pool')).toEqual([]);
  });
});

describe('the pools a preview would like to read', () => {
  it('names the pair, the tier and the swap size of every swap step', () => {
    expect(collectSwapPools([swapNode(), lpNode()], schemas)).toEqual([
      { nodeId: 's1', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, fee: 500, amountIn: 10 },
    ]);
  });

  it('skips a swap whose pair is not chosen yet', () => {
    expect(collectSwapPools([swapNode({ tokenOut: '' })], schemas)).toEqual([]);
  });

  it('reports an unknown size instead of a zero one', () => {
    expect(collectSwapPools([swapNode({ amountIn_useZero: true })], schemas)).toEqual([
      { nodeId: 's1', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, fee: 500, amountIn: null },
    ]);
  });

  it('treats an amount read from a context slot as an unknown size', () => {
    // On chain the slot wins over the amount field: the real size is whatever
    // an earlier step wrote, and nobody knows that before the run.
    expect(
      collectSwapPools([swapNode({ amountInFromSlot: 2 })], schemas),
    ).toEqual([
      { nodeId: 's1', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, fee: 500, amountIn: null },
    ]);
  });

  it('reads slot zero as a slot, not as "none"', () => {
    expect(
      collectSwapPools([swapNode({ amountInFromSlot: 0 })], schemas),
    ).toEqual([
      { nodeId: 's1', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, fee: 500, amountIn: null },
    ]);
  });

  it('keeps the amount when the slot is at the catalog’s unset sentinel', () => {
    expect(
      collectSwapPools(
        [swapNode({ amountInFromSlot: UNSET_CONTEXT_SLOT })],
        schemas,
      ),
    ).toEqual([
      { nodeId: 's1', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, fee: 500, amountIn: 10 },
    ]);
  });

  it('ignores a slot the step only writes to', () => {
    // The output slot says nothing about how big the input is.
    expect(
      collectSwapPools([swapNode({ amountOutToSlot: 3 })], schemas),
    ).toEqual([
      { nodeId: 's1', tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, fee: 500, amountIn: 10 },
    ]);
  });
});

describe('liquidity active around the pool price', () => {
  const SQRT_ONE = 2n ** 96n; // price 1.0 between two 18-decimals tokens

  it('splits a balanced pool into the two sides it actually holds', () => {
    expect(activeReserve(SQRT_ONE, 10n ** 21n, true, 18)).toBeCloseTo(1000, 6);
    expect(activeReserve(SQRT_ONE, 10n ** 21n, false, 18)).toBeCloseTo(1000, 6);
  });

  it('measures the input side of a four-to-one pool', () => {
    const sqrtFour = 2n * 2n ** 96n; // price 4.0 ⇒ sqrt 2
    expect(activeReserve(sqrtFour, 10n ** 21n, true, 18)).toBeCloseTo(500, 6);
    expect(activeReserve(sqrtFour, 10n ** 21n, false, 18)).toBeCloseTo(2000, 6);
  });

  it('answers "unknown" for an uninitialised pool instead of zero', () => {
    expect(activeReserve(0n, 10n ** 21n, true, 18)).toBeNull();
    expect(activeReserve(SQRT_ONE, 0n, true, 18)).toBeNull();
  });
});

describe('an LP range under a price shock', () => {
  it('stays in range while the move fits inside the band', () => {
    const { rows } = buildPriceShockPreview([lpNode()], schemas);
    const row = rowFor<RangeRow>(rows, 'l1');

    // Whole ticks cannot hit 10 % exactly; the band the user picked is shown
    // and judged as the 10.00 % it reads as.
    expect(row.widthUp).toBeCloseTo(0.1, 4);
    expect(outcomeAt(row, 10)).toMatchObject({ inRange: true });
  });

  it('drops out of range on a move wider than the band', () => {
    const { rows } = buildPriceShockPreview([lpNode()], schemas);
    const row = rowFor<RangeRow>(rows, 'l1');

    expect(outcomeAt(row, 20)).toMatchObject({ inRange: false });
    expect(outcomeAt(row, -20)).toMatchObject({ inRange: false });
  });

  it('does not pretend the downside band is as wide as the upside one', () => {
    const { rows } = buildPriceShockPreview([lpNode()], schemas);
    const row = rowFor<RangeRow>(rows, 'l1');

    // +10 % up is only −9.09 % down: the same tick distance, a smaller price move.
    expect(row.widthDown).toBeCloseTo(0.0909, 3);
    expect(outcomeAt(row, -10)).toMatchObject({ inRange: false });
  });

  it('refuses to guess where an explicit price range sits', () => {
    const { rows } = buildPriceShockPreview(
      [lpNode({ rangeMode: 0, tickDelta: 0, tickLower: -600, tickUpper: 600 })],
      schemas,
    );

    expect(rows).toEqual([
      { kind: 'unavailable', nodeId: 'l1', stepName: 'lp step', reason: 'explicit-range' },
    ]);
  });
});

describe('a lending position under a price shock', () => {
  const market = { lending: { healthFactor: 1.5 } };

  it('moves the Health Factor with the collateral price', () => {
    const { rows } = buildPriceShockPreview([aaveNode()], schemas, market);
    const row = rowFor<HealthRow>(rows, 'a1');

    expect(row.healthFactor).toBe(1.5);
    expect(outcomeAt(row, -20).healthFactor).toBeCloseTo(1.2, 10);
    expect(outcomeAt(row, 20).healthFactor).toBeCloseTo(1.8, 10);
  });

  it('calls out the move that would put the position up for liquidation', () => {
    const { rows } = buildPriceShockPreview([aaveNode()], schemas, market);
    const row = rowFor<HealthRow>(rows, 'a1');

    expect(outcomeAt(row, -20)).toMatchObject({ liquidatable: false });
    expect(outcomeAt(row, -50)).toMatchObject({ liquidatable: true });
  });

  it('names the target the step steers at, separately from the reading', () => {
    // The row shows the vault as it stands NOW. The target is what the step
    // will aim at when it fires — a different statement, kept apart so the
    // present-day reading is never mistaken for a post-deploy forecast.
    const { rows } = buildPriceShockPreview([aaveNode()], schemas, market);
    const row = rowFor<HealthRow>(rows, 'a1');

    expect(row.targetHealthFactor).toBe(1.6);
    expect(row.healthFactor).toBe(1.5);
    expect(outcomeAt(row, -20).healthFactor).toBeCloseTo(1.2, 10);
  });

  it('names no target for a step that does not steer at one', () => {
    // Outside TARGET_HF mode the catalog leaves the field at its default, so
    // printing it would announce a target the step never pursues.
    const { rows } = buildPriceShockPreview(
      [aaveNode({ mode: 0, targetHealthFactor: '0' })],
      schemas,
      market,
    );

    expect(rowFor<HealthRow>(rows, 'a1').targetHealthFactor).toBeNull();
  });

  it('names no target when the step has no mode field at all', () => {
    const { rows } = buildPriceShockPreview(
      [node('a1', 'aaveBare', { targetHealthFactor: '1.6' })],
      { aaveBare: { paramSchema: { type: 'object', properties: {
        targetHealthFactor: { type: 'string', 'x-ui-widget': 'health-factor' },
      } } } },
      market,
    );

    expect(rowFor<HealthRow>(rows, 'a1').targetHealthFactor).toBeNull();
  });

  it('says the position could not be read rather than inventing a Health Factor', () => {
    const { rows } = buildPriceShockPreview([aaveNode()], schemas);

    expect(rows).toEqual([
      { kind: 'unavailable', nodeId: 'a1', stepName: 'aave step', reason: 'no-lending-data' },
    ]);
  });

  it('separates "no debt yet" from "could not read"', () => {
    const { rows } = buildPriceShockPreview([aaveNode()], schemas, {
      lending: { healthFactor: null },
    });

    expect(rows).toEqual([
      {
        kind: 'unavailable',
        nodeId: 'a1',
        stepName: 'aave step',
        reason: 'no-lending-position',
      },
    ]);
  });
});

describe('the preview as a whole', () => {
  it('stays silent about steps that no price can touch', () => {
    const { rows, warnings } = buildPriceShockPreview(
      [node('t1', 'timer', { delta: 60 })],
      schemas,
    );

    expect(rows).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('keeps the steps in graph order', () => {
    const { rows } = buildPriceShockPreview(
      [node('t1', 'timer', {}), swapNode(), lpNode()],
      schemas,
      {},
    );

    expect(rows.map((r) => r.nodeId)).toEqual(['s1', 'l1']);
  });

  it('survives a step type the editor has no schema for', () => {
    const { rows } = buildPriceShockPreview([node('x1', 'unknown', {})], {});

    expect(rows).toEqual([]);
  });
});

describe('reading the pools of a graph', () => {
  const SQRT_ONE = 2n ** 96n;
  const decimals = { [TOKEN_IN]: 18, [TOKEN_OUT]: 18 };
  const pools = () => collectSwapPools([swapNode()], schemas);

  it('measures the input side of every pool it could read', async () => {
    const depths = await readSwapDepths(pools(), decimals, async () => ({
      sqrtPriceX96: SQRT_ONE,
      liquidity: 10n ** 21n,
    }));

    expect(depths.s1?.reserveIn).toBeCloseTo(1000, 6);
  });

  it('leaves a swap without depth when its pool refuses to answer', async () => {
    const depths = await readSwapDepths(pools(), decimals, async () => {
      throw new Error('rpc down');
    });

    expect(depths).toEqual({});
  });

  it('does not read a pool whose amount comes from a slot', async () => {
    const readPool = vi.fn();
    await readSwapDepths(
      collectSwapPools([swapNode({ amountInFromSlot: 1 })], schemas),
      decimals,
      readPool,
    );

    expect(readPool).not.toHaveBeenCalled();
  });

  it('does not read a pool whose swap size is unknown anyway', async () => {
    const readPool = vi.fn();
    await readSwapDepths(
      collectSwapPools([swapNode({ amountIn_useZero: true })], schemas),
      decimals,
      readPool,
    );

    expect(readPool).not.toHaveBeenCalled();
  });

  it('refuses to guess the decimals of an unknown input token', async () => {
    const readPool = vi.fn();
    await readSwapDepths(pools(), {}, readPool);

    expect(readPool).not.toHaveBeenCalled();
  });
});
