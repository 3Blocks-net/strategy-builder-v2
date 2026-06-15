/**
 * PancakeSwap V3 pool-existence validity check.
 *
 * For Swap nodes the frontend calls `factory.getPool(tokenIn, tokenOut, fee)` at
 * configure time and blocks deploy if no pool exists for the chosen pair + fee
 * tier — so an invalid combination is caught at config, not as a silent runtime
 * revert. The pure helpers below (collect + build) are unit-tested; the on-chain
 * read is injected so it can be faked in tests.
 */
import type { ValidationError } from './types';
import type { StepSchema } from 'shared';

export const PCS_FACTORY_ABI = [
  {
    type: 'function',
    name: 'getPool',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
] as const;

/** BSC PancakeSwap V3 factory (override with VITE_PCS_FACTORY_ADDRESS). */
export const PCS_FACTORY_ADDRESS: string =
  (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_PCS_FACTORY_ADDRESS ?? '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';

const ZERO = '0x0000000000000000000000000000000000000000';

export interface SwapPoolCheck {
  nodeId: string;
  feeField: string;
  tokenIn: string;
  tokenOut: string;
  fee: number;
}

interface NodeLike {
  id: string;
  data: { stepTypeId: string; params: Record<string, unknown> };
}

function findFieldByWidget(
  schema: StepSchema | undefined,
  widget: string,
): string | undefined {
  const props = schema?.paramSchema?.properties ?? {};
  return Object.entries(props).find(([, f]) => f['x-ui-widget'] === widget)?.[0];
}

function findTokenFields(schema: StepSchema | undefined): string[] {
  const props = schema?.paramSchema?.properties ?? {};
  return Object.entries(props)
    .filter(([, f]) => f['x-ui-widget'] === 'token-selector')
    .map(([name]) => name);
}

/**
 * Collect the pool checks needed for the graph: one per Swap node (a node whose
 * step type has a `fee-tier` field) that has both tokens and a fee selected.
 */
export function collectSwapPoolChecks(
  nodes: NodeLike[],
  stepSchemas: Record<string, StepSchema>,
): SwapPoolCheck[] {
  const checks: SwapPoolCheck[] = [];
  for (const node of nodes) {
    const schema = stepSchemas[node.data.stepTypeId];
    const feeField = findFieldByWidget(schema, 'fee-tier');
    if (!feeField) continue;
    const [tokenInField, tokenOutField] = findTokenFields(schema);
    if (!tokenInField || !tokenOutField) continue;

    const tokenIn = node.data.params[tokenInField];
    const tokenOut = node.data.params[tokenOutField];
    const fee = node.data.params[feeField];
    if (
      typeof tokenIn !== 'string' ||
      typeof tokenOut !== 'string' ||
      tokenIn === '' ||
      tokenOut === '' ||
      fee === undefined ||
      fee === null
    )
      continue;

    checks.push({ nodeId: node.id, feeField, tokenIn, tokenOut, fee: Number(fee) });
  }
  return checks;
}

/**
 * Run the (injected) on-chain check for each Swap node and return a validation
 * error for every pair+tier that has no pool. `check` resolves to the pool
 * address (or zero/empty for none).
 */
export async function buildSwapPoolErrors(
  checks: SwapPoolCheck[],
  check: (tokenIn: string, tokenOut: string, fee: number) => Promise<string>,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  for (const c of checks) {
    let pool = ZERO;
    try {
      pool = await check(c.tokenIn, c.tokenOut, c.fee);
    } catch {
      pool = ZERO;
    }
    if (!pool || pool.toLowerCase() === ZERO) {
      errors.push({
        nodeId: c.nodeId,
        fieldName: c.feeField,
        message: 'No PancakeSwap pool exists for this token pair and fee tier',
      });
    }
  }
  return errors;
}
