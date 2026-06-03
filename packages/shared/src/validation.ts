/**
 * Generic, schema-driven parameter validation — no `zod`, no per-step-type key.
 *
 * A single widget-driven rule table covers BOTH validation modes:
 *  - `friendly`: the human-facing representation as stored in `node.data.params`
 *    (durations as `{ value, unit }`, amounts as human strings, …).
 *  - `raw`: the machine values the backend ABI-encoder receives, after the
 *    frontend encode-boundary mapper has converted friendly → raw.
 *
 * The same `paramSchema` metadata drives the frontend (friendly) and the
 * defensive backend guard (raw), so a new field needs only metadata, not new
 * validation code.
 *
 * Slice 2 (walking skeleton) ships the `duration` widget rule + the generic
 * `required` rule. Later slices extend the table (`token-amount`, `address`).
 */

import type { Duration, DurationUnit } from './duration';

export type ValidationMode = 'friendly' | 'raw';

export interface FieldSchema {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  'x-ui-widget'?: string;
  'x-ui-slot-access'?: string;
  [key: string]: unknown;
}

export interface ParamSchema {
  type?: string;
  properties?: Record<string, FieldSchema>;
  required?: string[];
}

export interface ValidateOptions {
  mode: ValidationMode;
  /** Only consulted in `friendly` mode (over-precision checks). */
  tokenDecimals?: Record<string, number>;
}

export interface ParamValidationError {
  field: string;
  message: string;
}

const DURATION_UNITS: DurationUnit[] = ['minutes', 'hours', 'days', 'weeks'];

function fieldLabel(schema: FieldSchema, field: string): string {
  return schema.title ?? field;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function isDuration(value: unknown): value is Duration {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'unit' in value
  );
}

const MAX_UINT256 = 1n << 256n;
const AMOUNT_RE = /^\d+(\.\d+)?$/;
const ZERO_AMOUNT_RE = /^0+(\.0+)?$/;

/**
 * Param key holding the flat boolean for a token-amount field's zero-toggle
 * (the "0 means something special" UX wrapper). Shared by the widget (writes),
 * the friendly validator, and the encode-boundary mapper so all three agree.
 */
export function zeroToggleField(field: string): string {
  return `${field}_useZero`;
}

function hasZeroToggle(schema: FieldSchema): boolean {
  return schema['x-ui-zero-toggle'] != null;
}

function isZeroToggleOn(
  field: string,
  schema: FieldSchema,
  params: Record<string, unknown>,
): boolean {
  return hasZeroToggle(schema) && params[zeroToggleField(field)] === true;
}

function validateTokenAmount(
  field: string,
  schema: FieldSchema,
  value: unknown,
  mode: ValidationMode,
  params: Record<string, unknown>,
  tokenDecimals?: Record<string, number>,
): ParamValidationError[] {
  const label = fieldLabel(schema, field);

  if (mode === 'raw') {
    // base units string: integer in [0, 2^256). The toggle boolean is stripped
    // before /encode, so raw mode only checks structural range.
    let n: bigint;
    try {
      n = BigInt(String(value));
    } catch {
      return [{ field, message: `${label} must be a whole number of base units` }];
    }
    if (n < 0n) return [{ field, message: `${label} must be at least 0` }];
    if (n >= MAX_UINT256) return [{ field, message: `${label} is too large` }];
    return [];
  }

  // friendly mode
  const toggled = hasZeroToggle(schema);

  // Toggle on ⇒ the amount is irrelevant (raw = 0), so it's always valid.
  if (toggled && isZeroToggleOn(field, schema, params)) {
    return [];
  }

  // Toggle off (or no toggle): the amount must be present.
  if (isEmpty(value)) {
    return [{ field, message: `${label} is required` }];
  }

  const str = String(value).trim();
  if (!AMOUNT_RE.test(str)) {
    return [{ field, message: `${label} must be a valid amount` }];
  }

  // With a zero-toggle, an inactive toggle means a positive amount is required
  // (US #17). Without a toggle (e.g. a threshold), 0 is allowed.
  if (toggled && ZERO_AMOUNT_RE.test(str)) {
    return [{ field, message: `${label} must be greater than 0` }];
  }

  const tokenField = schema['x-ui-amount-token-field'] as string | undefined;
  const tokenAddr = tokenField ? params[tokenField] : undefined;
  const decimals =
    typeof tokenAddr === 'string'
      ? tokenDecimals?.[tokenAddr.toLowerCase()]
      : undefined;

  if (decimals !== undefined) {
    const dot = str.indexOf('.');
    const places = dot === -1 ? 0 : str.length - dot - 1;
    if (places > decimals) {
      return [
        { field, message: `${label} allows at most ${decimals} decimal places` },
      ];
    }
  }

  return [];
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * A `token-selector` field must carry a real, non-zero ERC-20 address. In raw
 * mode (the defensive backend guard) a zero/missing token is rejected — it
 * mirrors the on-chain `ZeroToken`/`ZeroAsset` reverts so a misconfigured step
 * is caught at /encode (HTTP 400) rather than as a runtime revert. In friendly
 * mode the generic `required` rule already covers presence.
 */
function validateTokenSelector(
  field: string,
  schema: FieldSchema,
  value: unknown,
  mode: ValidationMode,
): ParamValidationError[] {
  if (mode !== 'raw') return [];
  const label = fieldLabel(schema, field);
  const str = typeof value === 'string' ? value : '';
  if (!ADDRESS_RE.test(str)) {
    return [{ field, message: `${label} must be a valid token address` }];
  }
  if (str.toLowerCase() === ZERO_ADDRESS) {
    return [{ field, message: `${label} must not be the zero address` }];
  }
  return [];
}

const TARGET_HF_MODE = 3;
const MIN_TARGET_HF_WAD = 1_050_000_000_000_000_000n; // 1.05e18
const MIN_TARGET_HF = 1.05;

/**
 * `aave-amount-mode` cross-field rule: when TARGET_HF (mode 3) is selected, the
 * sibling target-health-factor field (named by `x-ui-target-hf-field`) must be
 * above the 1.05 floor. Mirrors the on-chain `requireValidTargetHF` guard so a
 * bad target is caught at /encode (raw, in 1e18 wad) and in the editor
 * (friendly, a human number like 1.5). Other modes don't use the field.
 */
function validateAaveAmountMode(
  schema: FieldSchema,
  value: unknown,
  mode: ValidationMode,
  params: Record<string, unknown>,
): ParamValidationError[] {
  if (Number(value) !== TARGET_HF_MODE) return [];
  const hfField = schema['x-ui-target-hf-field'] as string | undefined;
  if (!hfField) return [];
  const hf = params[hfField];
  const msg = `Target health factor must be greater than ${MIN_TARGET_HF}`;

  if (mode === 'raw') {
    let n: bigint;
    try {
      n = BigInt(String(hf));
    } catch {
      return [{ field: hfField, message: msg }];
    }
    return n <= MIN_TARGET_HF_WAD ? [{ field: hfField, message: msg }] : [];
  }

  const num = Number(hf);
  return !Number.isFinite(num) || num <= MIN_TARGET_HF
    ? [{ field: hfField, message: msg }]
    : [];
}

function validateDuration(
  field: string,
  schema: FieldSchema,
  value: unknown,
  mode: ValidationMode,
): ParamValidationError[] {
  const label = fieldLabel(schema, field);

  if (mode === 'friendly') {
    if (!isDuration(value)) {
      return [{ field, message: `${label} must be a duration` }];
    }
    const { value: amount, unit } = value;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return [{ field, message: `${label} must be a number` }];
    }
    if (amount <= 0) {
      return [{ field, message: `${label} must be greater than 0` }];
    }
    if (!DURATION_UNITS.includes(unit)) {
      return [{ field, message: `${label} has an invalid unit` }];
    }
    return [];
  }

  // raw mode: seconds as a string or number, must be > 0
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) {
    return [{ field, message: `${label} must be a whole number of seconds` }];
  }
  if (seconds <= 0) {
    return [{ field, message: `${label} must be greater than 0` }];
  }
  return [];
}

export function validateParams(
  schema: ParamSchema,
  params: Record<string, unknown>,
  options: ValidateOptions,
): ParamValidationError[] {
  const errors: ParamValidationError[] = [];
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const [field, fieldSchema] of Object.entries(properties)) {
    const value = params[field];
    const widget = fieldSchema['x-ui-widget'];

    // Context-slot fields are auto-managed (allocated/initialised by the
    // editor + backend), never user-entered values — skip presence checks.
    const isAutoManaged = widget === 'context-slot';
    // Zero-toggle token-amount fields own their own presence rule (toggle on
    // suspends it), so the generic required check must not fire for them.
    const zeroToggled = widget === 'token-amount' && hasZeroToggle(fieldSchema);

    if (required.includes(field) && !isAutoManaged && !zeroToggled && isEmpty(value)) {
      errors.push({ field, message: `${fieldLabel(fieldSchema, field)} is required` });
      continue;
    }

    // Empty optional fields need no further checks — except zero-toggle
    // token-amount fields, whose rule must run even when empty (toggle off +
    // empty is an error; toggle on + empty is fine).
    if (isEmpty(value) && !zeroToggled) continue;

    if (widget === 'aave-amount-mode') {
      errors.push(
        ...validateAaveAmountMode(fieldSchema, value, options.mode, params),
      );
    } else if (widget === 'duration') {
      errors.push(...validateDuration(field, fieldSchema, value, options.mode));
    } else if (widget === 'token-selector') {
      errors.push(
        ...validateTokenSelector(field, fieldSchema, value, options.mode),
      );
    } else if (widget === 'token-amount') {
      errors.push(
        ...validateTokenAmount(
          field,
          fieldSchema,
          value,
          options.mode,
          params,
          options.tokenDecimals,
        ),
      );
    }
  }

  return errors;
}
