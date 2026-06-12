import { CORE_STEP_TYPES } from './catalog/core';
import { AAVE_STEP_TYPES } from './catalog/aave';
import { PANCAKESWAP_STEP_TYPES } from './catalog/pancakeswap';
export type { StepTypeDef } from './catalog/_shared';

/**
 * Composed StepType catalog (the single source the seed upserts and the integrity
 * guard checks). Per-domain entries live under ./catalog/*; order is preserved.
 */
export const STEP_TYPE_CATALOG = [
  ...CORE_STEP_TYPES,
  ...AAVE_STEP_TYPES,
  ...PANCAKESWAP_STEP_TYPES,
];
