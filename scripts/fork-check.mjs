// Small, dependency-free check: is a chain node (the local Hardhat/BSC fork)
// reachable under RPC_URL? Used by scripts/dev.mjs and scripts/doctor.mjs.
//
// The fork is deliberately a long-lived process of its own — no script starts
// it. So both entry points need the same answer to the same question, in the
// same words: which URL was checked, did anything answer, and what to run when
// nothing did.

import { readEnvValue } from './lib/env-file.mjs';
import { isForkReachable } from './lib/chain.mjs';

export { isForkReachable };

export const DEFAULT_RPC_URL = 'http://localhost:8545';

/**
 * Resolves the RPC URL to check: `env.RPC_URL` wins (lets callers/tests
 * override without touching the file), then the `RPC_URL=` line from the
 * backend .env file, then the hardcoded default.
 */
export function resolveRpcUrl(envFilePath, env = process.env) {
  return readEnvValue(envFilePath, 'RPC_URL', env) ?? DEFAULT_RPC_URL;
}

/** The visible hint printed when no node answers under rpcUrl. */
export function buildForkHint(rpcUrl) {
  return [
    `No chain node responding at ${rpcUrl}.`,
    'The local BSC fork is a separate, long-lived process. Start it in its own terminal:',
    '  pnpm contracts:fork:bsc',
    'Then run `pnpm dev` again — it deploys, seeds and starts everything else itself.',
  ].join('\n');
}

/**
 * Resolves the RPC URL and probes it, returning a hint when unreachable.
 * `hint` is `null` when the fork answered — callers print it (or not)
 * without deciding anything else.
 */
export async function checkFork({ envFilePath, env = process.env, timeoutMs } = {}) {
  const rpcUrl = resolveRpcUrl(envFilePath, env);
  const reachable = await isForkReachable(rpcUrl, { timeoutMs });
  return { rpcUrl, reachable, hint: reachable ? null : buildForkHint(rpcUrl) };
}
