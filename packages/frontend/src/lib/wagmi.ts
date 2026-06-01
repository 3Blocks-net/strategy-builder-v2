import { createConfig, http } from "wagmi";
import { bsc, bscTestnet, hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { createClient } from "viem";
import type { Chain } from "viem";

const chainOrder: Record<string, Chain[]> = {
  development: [hardhat],
  production: [bsc, bscTestnet],
};

const mode = import.meta.env.MODE ?? "development";
const chains = (chainOrder[mode] ?? chainOrder.development) as [
  Chain,
  ...Chain[],
];

export const config = createConfig({
  chains,
  connectors: [injected()],
  client({ chain }) {
    const useMulticall = chain.id !== hardhat.id;
    return createClient({
      chain,
      transport: http(),
      ...(useMulticall && { batch: { multicall: true } }),
      pollingInterval: 2_000,
    });
  },
});
