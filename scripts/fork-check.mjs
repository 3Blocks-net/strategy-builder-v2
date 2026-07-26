// Small, dependency-free check: is a chain node (the local Hardhat/BSC fork)
// reachable under RPC_URL? Used by scripts/dev.mjs (TASK-8): a non-blocking
// hint when the fork isn't running, instead of the indexer's misleading
// per-tick "failed to detect network" log.

import { existsSync, readFileSync } from 'node:fs';

export const DEFAULT_RPC_URL = 'http://localhost:8545';
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Resolves the RPC URL to check: `env.RPC_URL` wins (lets callers/tests
 * override without touching the file), then the `RPC_URL=` line from the
 * backend .env file, then the hardcoded default. Simple line parsing on
 * purpose — no dotenv dependency for reading a single value.
 */
export function resolveRpcUrl(envFilePath, env = process.env) {
  if (env.RPC_URL) return env.RPC_URL;

  if (envFilePath && existsSync(envFilePath)) {
    const contents = readFileSync(envFilePath, 'utf8');
    for (const rawLine of contents.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      if (key !== 'RPC_URL') continue;
      const value = line.slice(separatorIndex + 1).trim();
      if (value) return value;
    }
  }

  return DEFAULT_RPC_URL;
}

/**
 * Probes rpcUrl with a minimal eth_chainId JSON-RPC POST. Resolves to
 * true/false, never throws — unreachable host, timeout, and non-JSON-RPC
 * responses all count as "not reachable".
 */
export async function isForkReachable(rpcUrl, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = await response.json();
    return typeof body?.result === 'string';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The visible hint printed when no node answers under rpcUrl. */
export function buildForkHint(rpcUrl) {
  return [
    `No chain node responding at ${rpcUrl}.`,
    'On-chain features (indexer, contract reads) need the local fork running:',
    '  1. pnpm contracts:fork:bsc',
    '  2. pnpm contracts:deploy:fork',
    '  3. pnpm db:seed',
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
