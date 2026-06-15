import type { JsonRpcProvider } from 'ethers';

/**
 * Injection seam for the indexer's RPC provider (PEC-219).
 *
 * Provided as an HTTP `JsonRpcProvider({ staticNetwork: true })` in production
 * (or null when `RPC_URL` is unset → indexer disabled), and overridden with a
 * fake in tests so `tick()` can be driven deterministically without a chain.
 */
export const INDEXER_PROVIDER = Symbol('INDEXER_PROVIDER');

/** The subset of provider surface the indexer relies on. */
export type IndexerProvider = Pick<
  JsonRpcProvider,
  'getBlockNumber' | 'getLogs' | 'getBlock' | 'destroy'
>;
