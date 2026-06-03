import { describe, it, expect } from 'vitest';
import {
  mapParamsToRaw,
  mapGraphToRaw,
  buildContextOverrides,
  type StepSchema,
} from '../encode-boundary';
import { encodeTimestamp, zeroToggleField } from 'shared';

const intervalSchema: StepSchema = {
  paramSchema: {
    properties: {
      interval: { type: 'object', 'x-ui-widget': 'duration' },
      // friendly-only start-time field, NOT in abiFragment
      startTime: { type: 'integer', 'x-ui-widget': 'start-time', 'x-ui-time-slot-field': 'timeSlot' },
      timeSlot: { type: 'integer', 'x-ui-widget': 'context-slot' },
    },
    required: ['interval', 'timeSlot'],
  },
  abiFragment: {
    type: 'tuple',
    components: [
      { name: 'interval', type: 'uint256' },
      { name: 'timeSlot', type: 'uint32' },
    ],
  },
};

describe('mapParamsToRaw', () => {
  it('converts a friendly duration to raw seconds string', () => {
    const raw = mapParamsToRaw(
      { interval: { value: 7, unit: 'days' }, timeSlot: '__time_n1' },
      intervalSchema,
    );
    expect(raw.interval).toBe('604800');
  });

  it('strips friendly-only fields not in abiFragment', () => {
    const raw = mapParamsToRaw(
      { interval: { value: 1, unit: 'minutes' }, timeSlot: '__time_n1', startTime: 123 },
      intervalSchema,
    );
    expect(Object.keys(raw).sort()).toEqual(['interval', 'timeSlot']);
    expect('startTime' in raw).toBe(false);
  });

  it('passes the context-slot variable name through untouched', () => {
    const raw = mapParamsToRaw(
      { interval: { value: 90, unit: 'minutes' }, timeSlot: '__time_n1' },
      intervalSchema,
    );
    expect(raw.timeSlot).toBe('__time_n1');
    expect(raw.interval).toBe('5400');
  });

  it('omits unset fields so the backend can apply its defaults', () => {
    const raw = mapParamsToRaw({ interval: { value: 1, unit: 'days' } }, intervalSchema);
    expect('timeSlot' in raw).toBe(false);
  });

  it('returns {} for an unknown step schema', () => {
    expect(mapParamsToRaw({ interval: { value: 1, unit: 'days' } }, undefined)).toEqual({});
  });
});

describe('mapGraphToRaw', () => {
  it('maps every node and normalises edges', () => {
    const graph = mapGraphToRaw(
      [
        {
          id: 'c1',
          type: 'CONDITION',
          data: { stepTypeId: 'st-interval', params: { interval: { value: 7, unit: 'days' }, timeSlot: '__time_c1' } },
        },
      ],
      [{ source: 'c1', target: 'a1', sourceHandle: 'true' }],
      { 'st-interval': intervalSchema },
    );

    expect(graph.nodes[0].data.params.interval).toBe('604800');
    expect(graph.nodes[0].type).toBe('CONDITION');
    expect(graph.edges[0]).toEqual({ source: 'c1', target: 'a1', sourceHandle: 'true' });
  });

  it('defaults a missing sourceHandle to "out"', () => {
    const graph = mapGraphToRaw(
      [{ id: 'a1', type: 'ACTION', data: { stepTypeId: 'st-x', params: {} } }],
      [{ source: 'a1', target: 'a2', sourceHandle: null }],
      {},
    );
    expect(graph.edges[0].sourceHandle).toBe('out');
  });
});

const TOKEN_18 = '0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const TOKEN_6 = '0xBbBBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';

const balanceSchema: StepSchema = {
  paramSchema: {
    properties: {
      token: { type: 'string', 'x-ui-widget': 'token-selector' },
      account: { type: 'string', 'x-ui-widget': 'account-selector' },
      minBalance: { type: 'string', 'x-ui-widget': 'token-amount', 'x-ui-amount-token-field': 'token' },
      aboveOrEqual: { type: 'boolean' },
      minBalanceFromSlot: { type: 'integer', 'x-ui-widget': 'context-slot' },
    },
  },
  abiFragment: {
    type: 'tuple',
    components: [
      { name: 'token', type: 'address' },
      { name: 'account', type: 'address' },
      { name: 'minBalance', type: 'uint256' },
      { name: 'aboveOrEqual', type: 'bool' },
      { name: 'minBalanceFromSlot', type: 'uint32' },
    ],
  },
};

const tokenDecimals = {
  [TOKEN_18.toLowerCase()]: 18,
  [TOKEN_6.toLowerCase()]: 6,
};

describe('mapParamsToRaw — token-amount', () => {
  it('converts a human amount to base units using the token decimals (18)', () => {
    const raw = mapParamsToRaw(
      { token: TOKEN_18, account: '0xacc', minBalance: '1.5', aboveOrEqual: true },
      balanceSchema,
      tokenDecimals,
    );
    expect(raw.minBalance).toBe('1500000000000000000');
  });

  it('uses the token-specific decimals (6)', () => {
    const raw = mapParamsToRaw(
      { token: TOKEN_6, account: '0xacc', minBalance: '1.5', aboveOrEqual: true },
      balanceSchema,
      tokenDecimals,
    );
    expect(raw.minBalance).toBe('1500000');
  });

  it('allows 0', () => {
    const raw = mapParamsToRaw(
      { token: TOKEN_18, account: '0xacc', minBalance: '0', aboveOrEqual: true },
      balanceSchema,
      tokenDecimals,
    );
    expect(raw.minBalance).toBe('0');
  });

  it('throws when the token decimals are unknown', () => {
    expect(() =>
      mapParamsToRaw(
        { token: '0xUnknown', account: '0xacc', minBalance: '1.5', aboveOrEqual: true },
        balanceSchema,
        tokenDecimals,
      ),
    ).toThrow(/decimals/i);
  });
});

const transferSchema: StepSchema = {
  paramSchema: {
    properties: {
      token: { type: 'string', 'x-ui-widget': 'token-selector' },
      recipient: { type: 'string' },
      amount: {
        type: 'string',
        'x-ui-widget': 'token-amount',
        'x-ui-amount-token-field': 'token',
        'x-ui-zero-toggle': { label: 'Full vault balance' },
      },
    },
  },
  abiFragment: {
    type: 'tuple',
    components: [
      { name: 'token', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
};

describe('mapParamsToRaw — token-amount zero-toggle', () => {
  it('toggle ON → raw 0 regardless of the amount field', () => {
    const raw = mapParamsToRaw(
      {
        token: TOKEN_18,
        recipient: '0xrec',
        amount: '999',
        [zeroToggleField('amount')]: true,
      },
      transferSchema,
      tokenDecimals,
    );
    expect(raw.amount).toBe('0');
  });

  it('toggle OFF → base units via decimals', () => {
    const raw = mapParamsToRaw(
      {
        token: TOKEN_18,
        recipient: '0xrec',
        amount: '1.5',
        [zeroToggleField('amount')]: false,
      },
      transferSchema,
      tokenDecimals,
    );
    expect(raw.amount).toBe('1500000000000000000');
  });

  it('strips the friendly toggle boolean (not an abiFragment key)', () => {
    const raw = mapParamsToRaw(
      {
        token: TOKEN_18,
        recipient: '0xrec',
        amount: '1.5',
        [zeroToggleField('amount')]: false,
      },
      transferSchema,
      tokenDecimals,
    );
    expect(zeroToggleField('amount') in raw).toBe(false);
    expect(Object.keys(raw).sort()).toEqual(['amount', 'recipient', 'token']);
  });
});

describe('buildContextOverrides', () => {
  it('routes startTime → name-keyed override for the referenced slot', () => {
    const overrides = buildContextOverrides(
      [
        {
          id: 'c1',
          type: 'CONDITION',
          data: {
            stepTypeId: 'st-interval',
            params: {
              interval: { value: 7, unit: 'days' },
              startTime: 1_700_000_000,
              timeSlot: '__time_c1',
            },
          },
        },
      ],
      { 'st-interval': intervalSchema },
    );
    expect(overrides).toEqual({ '__time_c1': encodeTimestamp(1_700_000_000) });
  });

  it('skips nodes without a start-time field or without a slot name', () => {
    const overrides = buildContextOverrides(
      [{ id: 'a1', type: 'ACTION', data: { stepTypeId: 'st-x', params: {} } }],
      { 'st-x': { paramSchema: { properties: { foo: { type: 'string' } } } } },
    );
    expect(overrides).toEqual({});
  });

  it('omits the override when startTime is unset', () => {
    const overrides = buildContextOverrides(
      [
        {
          id: 'c1',
          type: 'CONDITION',
          data: { stepTypeId: 'st-interval', params: { interval: { value: 1, unit: 'days' }, timeSlot: '__time_c1' } },
        },
      ],
      { 'st-interval': intervalSchema },
    );
    expect(overrides).toEqual({});
  });
});
