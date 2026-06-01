import { createConfig, http } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { createClient } from 'viem';

export const config = createConfig({
  chains: [bsc, bscTestnet],
  connectors: [injected()],
  client({ chain }) {
    return createClient({
      chain,
      transport: http(),
      batch: { multicall: true },
      pollingInterval: 2_000,
    });
  },
});
