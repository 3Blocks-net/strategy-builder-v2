import type { TransactionReceipt } from 'viem';
import { config } from '@/lib/wagmi';

/**
 * Poll for a transaction receipt until it is mined (or the timeout elapses).
 * Returns the full receipt — including `logs` — so callers can decode emitted
 * events (e.g. to read an on-chain id back out of a creation transaction).
 */
export async function waitForReceipt(
  txHash: string,
  timeout = 60_000,
): Promise<TransactionReceipt | null> {
  const start = Date.now();
  const { createPublicClient, http } = await import('viem');
  const chain = config.chains[0];
  const client = createPublicClient({ chain, transport: http() });

  while (Date.now() - start < timeout) {
    try {
      const receipt = await client.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      if (receipt) return receipt;
    } catch {
      // not yet mined
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}
