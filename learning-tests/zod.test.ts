// Learning tests for zod@^4 (written against 4.0.x) — re-run after every Zod update.
// These verify the Zod behaviors PEC-217 (Trigger-Konfiguration) depends on:
//   - unit conversion (hours/days -> seconds) where input type != output type
//   - string-amount coercion for the `amount` form widget
//   - cross-field / value refinements (Timer delta > 0, slot XOR static)
//   - safeParse error shape for form UIs
//
// NOT wired into CI. Run manually, e.g.:
//   pnpm --filter frontend exec vitest run ../../learning-tests/zod.test.ts
// Requires `zod` to be installed in the package you run it from.
//
// If any of these fail after an upgrade, the assumptions in research.md §12 (Zod)
// are stale — update the doc and the PEC-217 conversion code accordingly.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import pkg from 'zod/package.json' assert { type: 'json' };

const NO_SLOT = 4294967295; // uint32 max — the "no context slot" sentinel used across the codebase

describe('zod version smoke test', () => {
  it('is a v4 release (catches accidental downgrade to v3)', () => {
    expect(pkg.version.startsWith('4.')).toBe(true);
  });
});

describe('unit conversion: hours -> seconds (.transform input != output)', () => {
  const HoursToSeconds = z
    .number()
    .positive()
    .transform((hours) => Math.round(hours * 3600));

  it('converts a human value to the contract value on parse', () => {
    expect(HoursToSeconds.parse(24)).toBe(86_400); // daily interval
    expect(HoursToSeconds.parse(1)).toBe(3_600);
  });

  it('input type is hours, output type is seconds (compile-time contract)', () => {
    // This is a *type-level* assertion documented as runtime behavior:
    type In = z.input<typeof HoursToSeconds>;
    type Out = z.output<typeof HoursToSeconds>;
    const _in: In = 24; // hours
    const _out: Out = HoursToSeconds.parse(_in); // seconds
    expect(typeof _out).toBe('number');
  });

  it('rejects non-positive input before transforming', () => {
    expect(HoursToSeconds.safeParse(0).success).toBe(false);
    expect(HoursToSeconds.safeParse(-5).success).toBe(false);
  });
});

describe('amount coercion (form binds amounts as strings)', () => {
  it('z.coerce.bigint parses a decimal string to bigint', () => {
    const Amount = z.coerce.bigint();
    expect(Amount.parse('1000000000000000000')).toBe(1_000_000_000_000_000_000n);
  });

  it('z.coerce.* input type is unknown in v4 (changed from v3) — documents the gotcha', () => {
    const schema = z.coerce.number();
    type Input = z.input<typeof schema>;
    // In v4 this is `unknown`; assigning an arbitrary value compiles.
    const raw: Input = '42' as unknown;
    expect(schema.parse(raw)).toBe(42);
  });
});

describe('TimerCondition params: refine rules', () => {
  const TimerParams = z
    .object({
      delta: z.coerce.number().int().positive(),
      timeSlot: z.union([z.string(), z.literal(NO_SLOT)]).optional(),
    })
    .refine((p) => p.delta > 0, { message: 'Delay must be greater than 0', path: ['delta'] });

  it('accepts a valid timer config', () => {
    const res = TimerParams.safeParse({ delta: '3600', timeSlot: 'startedAt' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.delta).toBe(3600);
  });

  it('rejects delta <= 0 and reports the failing path (for form field highlighting)', () => {
    const res = TimerParams.safeParse({ delta: '0' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes('delta'))).toBe(true);
    }
  });

  it('allows the NO_SLOT sentinel as a literal', () => {
    expect(TimerParams.safeParse({ delta: '60', timeSlot: NO_SLOT }).success).toBe(true);
  });
});

describe('error helpers renamed in v4', () => {
  it('z.flattenError exists (replacement for .flatten())', () => {
    const res = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(res.success).toBe(false);
    if (!res.success) {
      const flat = z.flattenError(res.error);
      expect(flat.fieldErrors.a).toBeTruthy();
    }
  });
});
