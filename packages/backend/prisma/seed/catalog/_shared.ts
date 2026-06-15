import { StepCategory } from '@prisma/client';

/** Vault function selectors (shared across step kinds). */
export const CHECK_SELECTOR = '0xd89f1e36';
export const EXECUTE_SELECTOR = '0x24856bc3';
export const AFTER_EXECUTION_SELECTOR = '0xb2792168';

/**
 * One StepType catalog entry, address-independent. `contractKey` names the deployed
 * contract; the seed orchestrator resolves it to an on-chain address. The schema
 * integrity guard consumes this static shape (name / abiFragment / paramSchema).
 */
export interface StepTypeDef {
  name: string;
  description: string;
  category: StepCategory;
  contractKey: string;
  selector: string;
  afterExecutionSelector: string | null;
  abiFragment: unknown;
  paramSchema: unknown;
}
