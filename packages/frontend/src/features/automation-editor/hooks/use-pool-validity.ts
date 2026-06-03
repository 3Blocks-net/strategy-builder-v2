import { useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import type { Address } from 'viem';
import { useEditorStore } from '../store/editor-store';
import {
  collectSwapPoolChecks,
  buildSwapPoolErrors,
  PCS_FACTORY_ABI,
  PCS_FACTORY_ADDRESS,
} from '../lib/pool-validity';

/**
 * Reads `factory.getPool(tokenIn, tokenOut, fee)` for each Swap node and feeds a
 * blocking validation error into the store when no pool exists for the chosen
 * pair + fee tier — so the Deploy gate catches it at config time. Debounced.
 */
export function usePoolValidity(): void {
  const nodes = useEditorStore((s) => s.nodes);
  const stepSchemas = useEditorStore((s) => s.stepSchemas);
  const setExternalErrors = useEditorStore((s) => s.setExternalErrors);
  const publicClient = usePublicClient();

  useEffect(() => {
    const checks = collectSwapPoolChecks(
      nodes.map((n) => ({ id: n.id, data: n.data })),
      stepSchemas,
    );
    if (checks.length === 0) {
      setExternalErrors([]);
      return;
    }
    if (!publicClient) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const errors = await buildSwapPoolErrors(checks, async (tokenIn, tokenOut, fee) => {
        const pool = await publicClient.readContract({
          address: PCS_FACTORY_ADDRESS as Address,
          abi: PCS_FACTORY_ABI,
          functionName: 'getPool',
          args: [tokenIn as Address, tokenOut as Address, fee],
        });
        return pool as string;
      });
      if (!cancelled) setExternalErrors(errors);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nodes, stepSchemas, publicClient, setExternalErrors]);
}
