import { JsonRpcProvider } from 'ethers';

/** Injection token for the chain-id lookup (stubbed in tests). */
export const CHAIN_ID_PROBE = 'CHAIN_ID_PROBE';

/** Asks the chain behind `rpcUrl` for its id. Rejects when it is unreachable. */
export type ChainIdProbe = (rpcUrl: string) => Promise<number>;

export const ethersChainIdProbe: ChainIdProbe = async (rpcUrl) => {
  const provider = new JsonRpcProvider(rpcUrl, undefined, {
    staticNetwork: true,
  });
  try {
    const network = await provider.getNetwork();
    return Number(network.chainId);
  } finally {
    provider.destroy();
  }
};
