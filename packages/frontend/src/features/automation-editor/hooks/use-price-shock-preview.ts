/**
 * Gathers what the price-shock preview needs and hands it to the pure core.
 *
 * Two sources, both already in the product: the cockpit's position endpoint
 * (for the vault's Aave health) and the PancakeSwap pools a swap step routes
 * through (for how big the swap is against the liquidity around the price).
 * No new endpoint, no new backend work.
 *
 * Every read here is allowed to fail. A failure narrows the preview and is
 * never surfaced as an error, because the deploy must stay possible even when
 * nothing can be computed.
 */
import { useEffect, useMemo, useState } from 'react';
import { usePublicClient } from 'wagmi';
import type { Address } from 'viem';
import { apiFetch } from '@/lib/api';
import { useEditorStore } from '../store/editor-store';
import {
  PCS_FACTORY_ABI,
  PCS_FACTORY_ADDRESS,
} from '../lib/pool-validity';
import {
  buildPriceShockPreview,
  collectSwapPools,
  readSwapDepths,
  type PreviewMarketData,
  type PreviewNode,
  type PriceShockPreview,
} from '../lib/price-shock';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const POOL_ABI = [
  {
    type: 'function',
    name: 'slot0',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint32' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'liquidity',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint128' }],
  },
] as const;

interface CockpitPosition {
  protocol?: string;
  kind?: string;
  metrics?: Record<string, unknown>;
}

/** The vault's Aave account health, as the cockpit already reports it. */
function readLendingHealth(
  positions: CockpitPosition[],
): PreviewMarketData['lending'] {
  const summary = positions.find(
    (p) => p.protocol === 'aave-v3' && p.kind === 'summary',
  );
  if (!summary) return { healthFactor: null };
  const healthFactor = summary.metrics?.healthFactor;
  return {
    healthFactor: typeof healthFactor === 'number' ? healthFactor : null,
  };
}

export interface PriceShockPreviewState {
  preview: PriceShockPreview;
  /** True while the optional figures are still being gathered. */
  loading: boolean;
}

export function usePriceShockPreview(
  vaultAddress: string | undefined,
): PriceShockPreviewState {
  const nodes = useEditorStore((s) => s.nodes);
  const stepSchemas = useEditorStore((s) => s.stepSchemas);
  const tokenDecimals = useEditorStore((s) => s.tokenDecimals);
  const publicClient = usePublicClient();

  const previewNodes: PreviewNode[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        data: {
          stepTypeId: node.data.stepTypeId,
          stepTypeName: node.data.stepTypeName,
          params: node.data.params ?? {},
        },
      })),
    [nodes],
  );

  const pools = useMemo(
    () => collectSwapPools(previewNodes, stepSchemas),
    [previewNodes, stepSchemas],
  );

  const [market, setMarket] = useState<PreviewMarketData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const gathered: PreviewMarketData = {};

      if (vaultAddress) {
        try {
          const res = await apiFetch(`/vaults/${vaultAddress}/positions`);
          if (res.ok) {
            const body = await res.json();
            gathered.lending = readLendingHealth(body?.positions ?? []);
          }
        } catch {
          // No position data: the health rows say so instead of guessing.
        }
      }

      if (publicClient && pools.length > 0) {
        gathered.depthByNode = await readSwapDepths(
          pools,
          tokenDecimals,
          async (pool) => {
            const address = (await publicClient.readContract({
              address: PCS_FACTORY_ADDRESS as Address,
              abi: PCS_FACTORY_ABI,
              functionName: 'getPool',
              args: [pool.tokenIn as Address, pool.tokenOut as Address, pool.fee],
            })) as string;
            if (!address || address.toLowerCase() === ZERO_ADDRESS) return null;
            const [slot0, liquidity] = await Promise.all([
              publicClient.readContract({
                address: address as Address,
                abi: POOL_ABI,
                functionName: 'slot0',
              }),
              publicClient.readContract({
                address: address as Address,
                abi: POOL_ABI,
                functionName: 'liquidity',
              }),
            ]);
            return {
              sqrtPriceX96: (slot0 as readonly bigint[])[0],
              liquidity: liquidity as bigint,
            };
          },
        );
      }

      if (!cancelled) {
        setMarket(gathered);
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [pools, tokenDecimals, vaultAddress, publicClient]);

  const preview = useMemo(
    () => buildPriceShockPreview(previewNodes, stepSchemas, market),
    [previewNodes, stepSchemas, market],
  );

  return { preview, loading };
}
