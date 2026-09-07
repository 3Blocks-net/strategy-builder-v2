import { validateParams, type FieldSchema, type ParamSchema } from 'shared';
import { STEP_TYPE_CATALOG } from '../../prisma/seed/step-types';

/**
 * The catalog side of the on-chain slippage guard (#21). The contract makes the
 * tolerance mandatory; these tests hold the catalog to the same promise and,
 * more importantly, prove that the SHARED validation takes its limits from the
 * catalog schema — one rule source, no second set of numbers anywhere. Every
 * expectation below is derived from the schema itself, so a changed bound is
 * followed here automatically instead of drifting.
 */

const TOLERANCE_FIELD = 'slippageToleranceBps';
const WINDOW_FIELD = 'twapWindow';
const PROTECTION_FIELDS = [TOLERANCE_FIELD, WINDOW_FIELD];

interface Component {
  name: string;
  type: string;
}

function components(entry: { abiFragment: unknown }): Component[] {
  return (entry.abiFragment as { components?: Component[] }).components ?? [];
}

function schemaOf(entry: { paramSchema: unknown }): ParamSchema {
  return entry.paramSchema as ParamSchema;
}

/** Every catalog entry whose ABI carries a slippage tolerance. */
const protectedSteps = STEP_TYPE_CATALOG.filter((e) =>
  components(e).some((c) => c.name === TOLERANCE_FIELD),
);

describe('swap steps carry the on-chain slippage protection', () => {
  it('exactly the swapping actions are protected — no swap ships without a tolerance', () => {
    expect(protectedSteps.map((e) => e.contractKey).sort()).toEqual([
      'PancakeSwapV3SwapAction',
      'PancakeSwapV3SwapToRangeRatioAction',
    ]);
  });

  it('no step still offers the removed unprotected placeholders', () => {
    for (const entry of STEP_TYPE_CATALOG) {
      const names = components(entry).map((c) => c.name);
      expect(names).not.toContain('amountOutMinimum');
      expect(names).not.toContain('minOutFromSlot');
    }
  });

  describe.each(protectedSteps.map((e) => [e.name, e] as const))('%s', (_name, entry) => {
    const schema = schemaOf(entry);
    const props = (schema.properties ?? {}) as Record<string, FieldSchema>;
    const tolerance = props[TOLERANCE_FIELD];
    const window = props[WINDOW_FIELD];

    /** Errors the shared validation reports for the two protection fields. */
    function protectionErrors(
      params: Record<string, unknown>,
      mode: 'friendly' | 'raw',
    ): string[] {
      return validateParams(schema, params, { mode })
        .filter((e) => PROTECTION_FIELDS.includes(e.field))
        .map((e) => e.field);
    }

    const defaults: Record<string, unknown> = {
      [TOLERANCE_FIELD]: tolerance?.default,
      [WINDOW_FIELD]: window?.default,
    };

    it('encodes the tolerance as uint16 and the window as uint32 (matches the action struct)', () => {
      const byName = new Map(components(entry).map((c) => [c.name, c.type]));
      expect(byName.get(TOLERANCE_FIELD)).toBe('uint16');
      expect(byName.get(WINDOW_FIELD)).toBe('uint32');
    });

    it('both fields are mandatory, bounded and defaulted inside their bounds', () => {
      for (const [name, field] of [
        [TOLERANCE_FIELD, tolerance],
        [WINDOW_FIELD, window],
      ] as const) {
        expect(schema.required).toContain(name);
        expect(typeof field?.minimum).toBe('number');
        expect(typeof field?.maximum).toBe('number');
        expect(field?.minimum as number).toBeLessThan(field?.maximum as number);
        expect(field?.default as number).toBeGreaterThanOrEqual(field?.minimum as number);
        expect(field?.default as number).toBeLessThanOrEqual(field?.maximum as number);
      }
    });

    it('describes what the protection does, and leaves the numbers to the schema', () => {
      expect(`${entry.description}`).toMatch(/revert/i);
      expect(tolerance?.description ?? '').toMatch(/basis points/i);
      // A bound written out as prose would be the second source this ticket removes.
      expect(tolerance?.description ?? '').not.toContain(String(tolerance?.minimum));
      expect(window?.description ?? '').not.toContain(String(window?.maximum));
    });

    it.each(['friendly', 'raw'] as const)(
      'the shared validation accepts the schema defaults (%s)',
      (mode) => {
        expect(protectionErrors(defaults, mode)).toEqual([]);
      },
    );

    it.each(['friendly', 'raw'] as const)(
      'the shared validation rejects values outside the schema bounds (%s)',
      (mode) => {
        expect(
          protectionErrors(
            {
              [TOLERANCE_FIELD]: (tolerance?.minimum as number) - 1,
              [WINDOW_FIELD]: (window?.minimum as number) - 1,
            },
            mode,
          ),
        ).toEqual(PROTECTION_FIELDS);
        expect(
          protectionErrors(
            {
              [TOLERANCE_FIELD]: (tolerance?.maximum as number) + 1,
              [WINDOW_FIELD]: (window?.maximum as number) + 1,
            },
            mode,
          ),
        ).toEqual(PROTECTION_FIELDS);
      },
    );

    it.each(['friendly', 'raw'] as const)(
      'the shared validation rejects a missing tolerance (%s)',
      (mode) => {
        expect(protectionErrors({ [WINDOW_FIELD]: window?.default }, mode)).toEqual([
          TOLERANCE_FIELD,
        ]);
      },
    );
  });
});
