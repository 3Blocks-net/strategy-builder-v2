/**
 * Re-exports the framework-free duration helpers from the `shared` package so
 * the automation editor (encode-boundary mapper) has a single import site for
 * friendly -> raw duration conversion. Proves `shared` resolves under Vite/ESM.
 */
export { toSeconds, fromSeconds } from 'shared';
export type { Duration, DurationUnit } from 'shared';
