import { describe, it, expect, vi } from 'vitest';
import { collectSwapPoolChecks, buildSwapPoolErrors } from '../pool-validity';
import type { StepSchema } from '../encode-boundary';

const swapSchema: StepSchema = {
  paramSchema: {
    properties: {
      tokenIn: { type: 'string', 'x-ui-widget': 'token-selector', 'x-ui-token-source': 'pancakeswap' },
      tokenOut: { type: 'string', 'x-ui-widget': 'token-selector', 'x-ui-token-source': 'pancakeswap' },
      fee: { type: 'integer', 'x-ui-widget': 'fee-tier' },
      amountIn: { type: 'string', 'x-ui-widget': 'token-amount' },
    },
  },
  abiFragment: { type: 'tuple', components: [] },
};

const transferSchema: StepSchema = {
  paramSchema: { properties: { token: { type: 'string', 'x-ui-widget': 'token-selector' } } },
  abiFragment: { type: 'tuple', components: [] },
};

const USDT = '0x55d398326f99059fF775485246999027B3197955';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const ZERO = '0x0000000000000000000000000000000000000000';
const POOL = '0x1234567890123456789012345678901234567890';

const schemas = { swap: swapSchema, transfer: transferSchema };

describe('collectSwapPoolChecks', () => {
  it('collects a check for a fully-configured swap node', () => {
    const nodes = [
      { id: 's1', data: { stepTypeId: 'swap', params: { tokenIn: USDT, tokenOut: WBNB, fee: 500 } } },
    ];
    expect(collectSwapPoolChecks(nodes, schemas)).toEqual([
      { nodeId: 's1', feeField: 'fee', tokenIn: USDT, tokenOut: WBNB, fee: 500 },
    ]);
  });

  it('skips non-swap nodes (no fee-tier field)', () => {
    const nodes = [{ id: 't1', data: { stepTypeId: 'transfer', params: { token: USDT } } }];
    expect(collectSwapPoolChecks(nodes, schemas)).toEqual([]);
  });

  it('skips swap nodes missing a token or fee', () => {
    const nodes = [
      { id: 's1', data: { stepTypeId: 'swap', params: { tokenIn: USDT, tokenOut: '', fee: 500 } } },
    ];
    expect(collectSwapPoolChecks(nodes, schemas)).toEqual([]);
  });
});

describe('buildSwapPoolErrors', () => {
  it('returns no error when the pool exists', async () => {
    const check = vi.fn().mockResolvedValue(POOL);
    const errors = await buildSwapPoolErrors(
      [{ nodeId: 's1', feeField: 'fee', tokenIn: USDT, tokenOut: WBNB, fee: 500 }],
      check,
    );
    expect(errors).toEqual([]);
    expect(check).toHaveBeenCalledWith(USDT, WBNB, 500);
  });

  it('returns a blocking error when the pool is the zero address', async () => {
    const errors = await buildSwapPoolErrors(
      [{ nodeId: 's1', feeField: 'fee', tokenIn: USDT, tokenOut: WBNB, fee: 100 }],
      async () => ZERO,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ nodeId: 's1', fieldName: 'fee' });
    expect(errors[0].message).toMatch(/No PancakeSwap pool/);
  });

  it('treats a failed read as a missing pool (blocks deploy)', async () => {
    const errors = await buildSwapPoolErrors(
      [{ nodeId: 's1', feeField: 'fee', tokenIn: USDT, tokenOut: WBNB, fee: 100 }],
      async () => {
        throw new Error('rpc');
      },
    );
    expect(errors).toHaveLength(1);
  });
});
