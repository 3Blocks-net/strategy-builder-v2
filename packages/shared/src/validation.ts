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

    if (required.includes(field) && !isAutoManaged && isEmpty(value)) {
      errors.push({ field, message: `${fieldLabel(fieldSchema, field)} is required` });
      continue;
    }

    if (isEmpty(value)) continue; // optional + empty → nothing more to check

    if (widget === 'duration') {
      errors.push(...validateDuration(field, fieldSchema, value, options.mode));
    }
  }

  return errors;
}
