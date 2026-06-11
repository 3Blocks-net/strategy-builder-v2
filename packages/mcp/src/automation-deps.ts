import { createPublicClient, http, getAddress, type Abi } from 'viem';
import { BackendClient } from './backend-client.js';
import type { DecoderCatalog } from './summary-decoder.js';
import type { GetPool } from './tools/propose-automation.js';

const ZERO = '0x0000000000000000000000000000000000000000';

interface RawStepType {
  id: string;
  name: string;
  contractAddress: string;
  paramSchema: unknown;
  abiFragment: unknown;
}

/** Baut den Decoder-/Mapper-Katalog (stepTypeId → Name/Schema), nur deployte Steps. */
export async function loadCatalog(backend: BackendClient): Promise<DecoderCatalog> {
  const steps = await backend.get<RawStepType[]>('/step-types');
  const catalog: DecoderCatalog = {};
  for (const s of steps) {
    if (s.contractAddress.toLowerCase() === ZERO) continue;
    catalog[s.id] = {
      name: s.name,
      paramSchema: s.paramSchema as DecoderCatalog[string]['paramSchema'],
      abiFragment: s.abiFragment as DecoderCatalog[string]['abiFragment'],
    };
  }
  return catalog;
}

interface RawToken {
  address: string;
  decimals: number;
}

/** lowercased Token-Adresse → Decimals (kuratierte Protokoll-Listen + Fee-Tokens). */
export async function loadTokenDecimals(
  backend: BackendClient,
): Promise<Record<string, number>> {
  const decimals: Record<string, number> = {};
  const add = (tokens: RawToken[] | undefined) => {
    for (const t of tokens ?? []) {
      if (t?.address && typeof t.decimals === 'number') {
        decimals[t.address.toLowerCase()] = t.decimals;
      }
    }
  };
  // Fehlende Protokolle/Endpunkte tolerieren — Best-effort.
  const safe = async (path: string): Promise<RawToken[]> => {
    try {
      return await backend.get<RawToken[]>(path);
    } catch {
      return [];
    }
  };
  add(await safe('/tokens?protocol=aave'));
  add(await safe('/tokens?protocol=pancakeswap'));
  try {
    const { tokens } = await backend.get<{ tokens: RawToken[] }>('/tokens/accepted');
    add(tokens);
  } catch {
    /* optional */
  }
  return decimals;
}

const FACTORY_GET_POOL_ABI = [
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
] as const satisfies Abi;

/** `factory.getPool(tokenA, tokenB, fee)` via viem-RPC-Read (Pool-Existenz-Check). */
export function makeGetPool(rpcUrl: string, factoryAddress: string): GetPool {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return async (tokenA, tokenB, fee) => {
    return client.readContract({
      address: getAddress(factoryAddress),
      abi: FACTORY_GET_POOL_ABI,
      functionName: 'getPool',
      args: [getAddress(tokenA), getAddress(tokenB), fee],
    }) as Promise<string>;
  };
}
