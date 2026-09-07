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

/**
 * Slippage protection, shared by every swapping action.
 *
 * These two fields are the catalog side of the on-chain rule in
 * `SlippageGuard` (packages/contracts/contracts/libraries/SlippageGuard.sol):
 * the guard rejects a tolerance or window outside these bounds, so the bounds
 * are stated here ONCE, as JSON-Schema `minimum`/`maximum`, and everything
 * downstream reads them from here — the editor (friendly mode), the backend
 * `/encode` guard (raw mode) and the AI assistant, all through
 * `validateParams` in `shared`. A second copy of a bound anywhere else would
 * be exactly the drift that lets a UI wave through a deploy the chain reverts.
 *
 * The bounds are NOT repeated in the descriptions: the description says what
 * the number does, the schema says what it may be.
 */
export const SLIPPAGE_TOLERANCE_FIELD = {
  type: 'integer',
  title: 'Max. Slippage',
  description:
    'How far below the pool’s reference price the swap may execute before it reverts. ' +
    'Stated in basis points (1 bp = 0.01 %). A tighter value gives away less to a sandwich ' +
    'attack or a sudden price move but lets the step fail more often in a volatile market; ' +
    'a wider value almost always executes and accepts the worse price. Mandatory — an ' +
    'unprotected swap is not expressible.',
  'x-ui-widget': 'slippage-tolerance',
  minimum: 10,
  maximum: 1000,
  default: 100,
};

export const TWAP_WINDOW_FIELD = {
  type: 'integer',
  title: 'Reference Window',
  description:
    'The number of seconds the reference price is averaged over (time-weighted average of ' +
    'the pool price). Because the bar is an average, a price spike inside a single block ' +
    'cannot set it — an attacker has to hold the moved price across the whole window. ' +
    'Longer windows are harder to manipulate; shorter ones follow a genuine trend more ' +
    'closely. If the pool’s oracle does not reach back this far, the swap falls back to the ' +
    'current spot price with half the tolerance.',
  'x-ui-widget': 'twap-window',
  minimum: 60,
  maximum: 900,
  default: 300,
};
