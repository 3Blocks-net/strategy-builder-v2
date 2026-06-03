/**
 * Pure, IO-free duration <-> seconds conversion.
 *
 * Durations are stored in their friendly form (`{ value, unit }`) and converted
 * to raw seconds at the encode boundary. `fromSeconds` is the inverse, used only
 * for round-trip tests — it is not needed at runtime (no back-compat decompose).
 */

export type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks';

export interface Duration {
  value: number;
  unit: DurationUnit;
}

const SECONDS_PER_UNIT: Record<DurationUnit, number> = {
  minutes: 60,
  hours: 60 * 60,
  days: 60 * 60 * 24,
  weeks: 60 * 60 * 24 * 7,
};

/** Convert a friendly duration into whole seconds. */
export function toSeconds({ value, unit }: Duration): number {
  const perUnit = SECONDS_PER_UNIT[unit];
  if (perUnit === undefined) {
    throw new Error(`Unknown duration unit: ${String(unit)}`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Duration value must be a finite number, got: ${String(value)}`);
  }
  return value * perUnit;
}

/**
 * Inverse of {@link toSeconds} for a given unit. Test-only helper for round-trip
 * verification; runtime code never reverses raw seconds back to friendly form.
 */
export function fromSeconds(seconds: number, unit: DurationUnit): Duration {
  const perUnit = SECONDS_PER_UNIT[unit];
  if (perUnit === undefined) {
    throw new Error(`Unknown duration unit: ${String(unit)}`);
  }
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    throw new Error(`Seconds must be a finite number, got: ${String(seconds)}`);
  }
  return { value: seconds / perUnit, unit };
}
