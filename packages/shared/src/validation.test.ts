import { describe, it, expect } from 'vitest';
import { validateParams, type ParamSchema } from './validation';

const intervalSchema: ParamSchema = {
  type: 'object',
  properties: {
    interval: {
      type: 'object',
      title: 'Interval',
      'x-ui-widget': 'duration',
    },
    timeSlot: {
      type: 'integer',
      title: 'Time Slot',
      'x-ui-widget': 'context-slot',
      'x-ui-slot-access': 'read-write',
    },
  },
  required: ['interval', 'timeSlot'],
};

describe('validateParams — duration (friendly mode)', () => {
  it('accepts a positive duration', () => {
    const errors = validateParams(
      intervalSchema,
      { interval: { value: 7, unit: 'days' }, timeSlot: '__time_n1' },
      { mode: 'friendly' },
    );
    expect(errors).toEqual([]);
  });

  it('rejects value 0', () => {
    const errors = validateParams(
      intervalSchema,
      { interval: { value: 0, unit: 'days' }, timeSlot: '__time_n1' },
      { mode: 'friendly' },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'interval' });
    expect(errors[0].message).toMatch(/greater than 0/);
  });

  it('rejects a non-duration value', () => {
    const errors = validateParams(
      intervalSchema,
      { interval: '604800', timeSlot: '__time_n1' },
      { mode: 'friendly' },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('interval');
  });

  it('rejects an invalid unit', () => {
    const errors = validateParams(
      intervalSchema,
      { interval: { value: 5, unit: 'months' }, timeSlot: '__time_n1' },
      { mode: 'friendly' },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/invalid unit/);
  });
});

describe('validateParams — duration (raw mode)', () => {
  it('accepts positive seconds (string)', () => {
    const errors = validateParams(
      intervalSchema,
      { interval: '604800', timeSlot: '__time_n1' },
      { mode: 'raw' },
    );
    expect(errors).toEqual([]);
  });

  it('rejects seconds = 0', () => {
    const errors = validateParams(
      intervalSchema,
      { interval: '0', timeSlot: '__time_n1' },
      { mode: 'raw' },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'interval' });
    expect(errors[0].message).toMatch(/greater than 0/);
  });

  it('rejects non-numeric seconds', () => {
    const errors = validateParams(
      intervalSchema,
      { interval: 'abc', timeSlot: '__time_n1' },
      { mode: 'raw' },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('interval');
  });
});

const balanceSchema: ParamSchema = {
  type: 'object',
  properties: {
    token: { type: 'string', title: 'Token', 'x-ui-widget': 'token-selector' },
    account: { type: 'string', title: 'Account', 'x-ui-widget': 'account-selector' },
    minBalance: {
      type: 'string',
      title: 'Minimum Balance',
      'x-ui-widget': 'token-amount',
      'x-ui-amount-token-field': 'token',
    },
    aboveOrEqual: { type: 'boolean', title: 'Above or Equal', default: true },
  },
  required: ['token', 'account', 'minBalance', 'aboveOrEqual'],
};

const TOKEN_18 = '0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const TOKEN_6 = '0xBbBBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const tokenDecimals = {
  [TOKEN_18.toLowerCase()]: 18,
  [TOKEN_6.toLowerCase()]: 6,
};

describe('validateParams — token-amount (friendly mode)', () => {
  it('accepts an in-precision amount for an 18-decimal token', () => {
    const errors = validateParams(
      balanceSchema,
      { token: TOKEN_18, account: '0x1', minBalance: '1.5', aboveOrEqual: true },
      { mode: 'friendly', tokenDecimals },
    );
    expect(errors).toEqual([]);
  });

  it('allows 0 (no toggle)', () => {
    const errors = validateParams(
      balanceSchema,
      { token: TOKEN_18, account: '0x1', minBalance: '0', aboveOrEqual: true },
      { mode: 'friendly', tokenDecimals },
    );
    expect(errors).toEqual([]);
  });

  it('flags over-precision for a 6-decimal token', () => {
    const errors = validateParams(
      balanceSchema,
      { token: TOKEN_6, account: '0x1', minBalance: '1.1234567', aboveOrEqual: true },
      { mode: 'friendly', tokenDecimals },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'minBalance' });
    expect(errors[0].message).toMatch(/6 decimal places/);
  });

  it('flags an unparseable amount', () => {
    const errors = validateParams(
      balanceSchema,
      { token: TOKEN_18, account: '0x1', minBalance: 'abc', aboveOrEqual: true },
      { mode: 'friendly', tokenDecimals },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('minBalance');
  });

  it('skips the decimals check when no token is selected (still parses)', () => {
    const errors = validateParams(
      balanceSchema,
      { token: TOKEN_18, account: '0x1', minBalance: '1.123456789', aboveOrEqual: true },
      { mode: 'friendly' }, // no tokenDecimals → over-precision not checkable
    );
    expect(errors).toEqual([]);
  });
});

describe('validateParams — token-amount (raw mode)', () => {
  it('accepts base units within range and 0', () => {
    expect(
      validateParams(
        balanceSchema,
        { token: TOKEN_18, account: '0x1', minBalance: '1500000000000000000', aboveOrEqual: true },
        { mode: 'raw' },
      ),
    ).toEqual([]);
    expect(
      validateParams(
        balanceSchema,
        { token: TOKEN_18, account: '0x1', minBalance: '0', aboveOrEqual: true },
        { mode: 'raw' },
      ),
    ).toEqual([]);
  });

  it('rejects base units >= 2^256', () => {
    const tooBig = (1n << 256n).toString();
    const errors = validateParams(
      balanceSchema,
      { token: TOKEN_18, account: '0x1', minBalance: tooBig, aboveOrEqual: true },
      { mode: 'raw' },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'minBalance' });
  });
});

const transferSchema: ParamSchema = {
  type: 'object',
  properties: {
    token: { type: 'string', title: 'Token', 'x-ui-widget': 'token-selector' },
    amount: {
      type: 'string',
      title: 'Amount',
      'x-ui-widget': 'token-amount',
      'x-ui-amount-token-field': 'token',
      'x-ui-zero-toggle': { label: 'Full vault balance' },
    },
  },
  required: ['token', 'amount'],
};

describe('validateParams — token-amount zero-toggle (friendly)', () => {
  it('toggle ON: amount irrelevant, valid even when empty', () => {
    const errors = validateParams(
      transferSchema,
      { token: TOKEN_18, amount: '', amount_useZero: true },
      { mode: 'friendly', tokenDecimals },
    );
    expect(errors).toEqual([]);
  });

  it('toggle OFF: empty amount is an error (US #17)', () => {
    const errors = validateParams(
      transferSchema,
      { token: TOKEN_18, amount: '', amount_useZero: false },
      { mode: 'friendly', tokenDecimals },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'amount' });
  });

  it('toggle OFF: amount 0 is an error (US #17)', () => {
    const errors = validateParams(
      transferSchema,
      { token: TOKEN_18, amount: '0', amount_useZero: false },
      { mode: 'friendly', tokenDecimals },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/greater than 0/);
  });

  it('toggle OFF (default/undefined): a positive amount is valid', () => {
    const errors = validateParams(
      transferSchema,
      { token: TOKEN_18, amount: '1.5' },
      { mode: 'friendly', tokenDecimals },
    );
    expect(errors).toEqual([]);
  });

  it('toggle OFF: over-precision still flagged', () => {
    const errors = validateParams(
      transferSchema,
      { token: TOKEN_6, amount: '1.1234567' },
      { mode: 'friendly', tokenDecimals },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/decimal places/);
  });
});

describe('validateParams — required', () => {
  it('flags a missing required scalar field', () => {
    const schema: ParamSchema = {
      type: 'object',
      properties: { token: { type: 'string', title: 'Token', 'x-ui-widget': 'token-selector' } },
      required: ['token'],
    };
    const errors = validateParams(schema, {}, { mode: 'friendly' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'token' });
    expect(errors[0].message).toMatch(/required/);
  });

  it('does not flag auto-managed context-slot fields as required', () => {
    const errors = validateParams(
      intervalSchema,
      { interval: { value: 1, unit: 'days' } },
      { mode: 'friendly' },
    );
    // timeSlot is required in the schema but is a context-slot widget → skipped
    expect(errors).toEqual([]);
  });

  it('treats 0 as present (required passes), duration rule then applies', () => {
    const errors = validateParams(
      intervalSchema,
      { interval: { value: 0, unit: 'days' } },
      { mode: 'friendly' },
    );
    expect(errors.map((e) => e.message).join()).toMatch(/greater than 0/);
  });
});

describe('validateParams — token-selector (raw-mode zero-token guard)', () => {
  const supplySchema: ParamSchema = {
    type: 'object',
    properties: {
      asset: {
        type: 'string',
        title: 'Token',
        'x-ui-widget': 'token-selector',
      },
    },
    required: ['asset'],
  };

  const real = '0x55d398326f99059fF775485246999027B3197955';
  const zero = '0x0000000000000000000000000000000000000000';

  it('accepts a real token address in raw mode', () => {
    const errors = validateParams(supplySchema, { asset: real }, { mode: 'raw' });
    expect(errors).toEqual([]);
  });

  it('rejects the zero address in raw mode', () => {
    const errors = validateParams(supplySchema, { asset: zero }, { mode: 'raw' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'asset' });
    expect(errors[0].message).toMatch(/zero address/);
  });

  it('rejects a malformed token address in raw mode', () => {
    const errors = validateParams(supplySchema, { asset: '0x123' }, { mode: 'raw' });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/valid token address/);
  });

  it('does not enforce the address shape in friendly mode (presence only)', () => {
    const errors = validateParams(supplySchema, { asset: zero }, { mode: 'friendly' });
    expect(errors).toEqual([]);
  });
});

describe('validateParams — aave-amount-mode TARGET_HF guard', () => {
  const schema: ParamSchema = {
    type: 'object',
    properties: {
      mode: {
        type: 'integer',
        title: 'Amount',
        'x-ui-widget': 'aave-amount-mode',
        'x-ui-target-hf-field': 'targetHealthFactor',
      },
      targetHealthFactor: { type: 'string', 'x-ui-hidden': true },
    },
    required: ['mode'],
  };

  it('ignores the target HF for non-TARGET_HF modes', () => {
    expect(validateParams(schema, { mode: 0, targetHealthFactor: '0' }, { mode: 'raw' })).toEqual([]);
    expect(validateParams(schema, { mode: 2, targetHealthFactor: '0' }, { mode: 'friendly' })).toEqual([]);
  });

  it('rejects a raw target ≤ 1.05e18 in TARGET_HF mode', () => {
    const errors = validateParams(
      schema,
      { mode: 3, targetHealthFactor: '1050000000000000000' },
      { mode: 'raw' },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'targetHealthFactor' });
    expect(errors[0].message).toMatch(/greater than 1.05/);
  });

  it('accepts a raw target > 1.05e18 in TARGET_HF mode', () => {
    expect(
      validateParams(schema, { mode: 3, targetHealthFactor: '1500000000000000000' }, { mode: 'raw' }),
    ).toEqual([]);
  });

  it('rejects a friendly target ≤ 1.05 in TARGET_HF mode', () => {
    const errors = validateParams(schema, { mode: 3, targetHealthFactor: '1.05' }, { mode: 'friendly' });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/greater than 1.05/);
  });

  it('accepts a friendly target > 1.05 in TARGET_HF mode', () => {
    expect(validateParams(schema, { mode: 3, targetHealthFactor: '1.5' }, { mode: 'friendly' })).toEqual([]);
  });
});

describe('validateParams — fee-tier guard', () => {
  const schema: ParamSchema = {
    type: 'object',
    properties: { fee: { type: 'integer', title: 'Fee Tier', 'x-ui-widget': 'fee-tier' } },
    required: ['fee'],
  };

  it('accepts the four valid tiers (raw)', () => {
    for (const fee of [100, 500, 2500, 10000]) {
      expect(validateParams(schema, { fee }, { mode: 'raw' })).toEqual([]);
    }
  });

  it('rejects an invalid tier (raw)', () => {
    const errors = validateParams(schema, { fee: 3000 }, { mode: 'raw' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'fee' });
    expect(errors[0].message).toMatch(/100, 500, 2500, 10000/);
  });

  it('does not enforce the tier in friendly mode (select)', () => {
    expect(validateParams(schema, { fee: 3000 }, { mode: 'friendly' })).toEqual([]);
  });
});

describe('validateParams — tick-range guard', () => {
  const schema: ParamSchema = {
    type: 'object',
    properties: {
      rangeMode: {
        type: 'integer',
        'x-ui-widget': 'tick-range',
        'x-ui-tick-lower-field': 'tickLower',
        'x-ui-tick-upper-field': 'tickUpper',
      },
      tickLower: { type: 'integer', 'x-ui-hidden': true },
      tickUpper: { type: 'integer', 'x-ui-hidden': true },
    },
    required: ['rangeMode'],
  };

  it('rejects tickLower >= tickUpper in explicit mode (rangeMode 0)', () => {
    const errors = validateParams(schema, { rangeMode: 0, tickLower: 100, tickUpper: 100 }, { mode: 'raw' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: 'tickUpper' });
  });

  it('accepts tickLower < tickUpper in explicit mode', () => {
    expect(validateParams(schema, { rangeMode: 0, tickLower: -100, tickUpper: 100 }, { mode: 'raw' })).toEqual([]);
  });

  it('ignores the tick check in preset mode (rangeMode 1)', () => {
    expect(validateParams(schema, { rangeMode: 1, tickLower: 0, tickUpper: 0 }, { mode: 'raw' })).toEqual([]);
  });
});

describe('validateParams — percent guard', () => {
  const schema: ParamSchema = {
    type: 'object',
    properties: { percent: { type: 'integer', title: 'Percentage', 'x-ui-widget': 'percent' } },
    required: ['percent'],
  };

  it('accepts 1..100', () => {
    for (const p of [1, 50, 100]) {
      expect(validateParams(schema, { percent: p }, { mode: 'raw' })).toEqual([]);
    }
  });

  it('rejects 0, 101, and non-integers', () => {
    expect(validateParams(schema, { percent: 0 }, { mode: 'raw' })).toHaveLength(1);
    expect(validateParams(schema, { percent: 101 }, { mode: 'friendly' })).toHaveLength(1);
    expect(validateParams(schema, { percent: 12.5 }, { mode: 'raw' })).toHaveLength(1);
  });
});
