import "dotenv/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

const BSC_RPC = process.env.BSC_MAINNET_RPC_URL ?? "https://bsc-dataseed.binance.org";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],

  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          viaIR: true,
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },

  networks: {
    // Local hardhat network (in-process, no fork)
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },

    // BSC Mainnet Fork (start with: npx hardhat node --network bscFork)
    bscFork: {
      type: "edr-simulated",
      chainType: "l1",
      forking: {
        url: BSC_RPC,
      },
    },

    // Connect to a running fork node on localhost:8545
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
      accounts: [DEPLOYER_KEY],
    },

    // BSC Testnet (Chain ID: 97)
    bscTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("BSC_TESTNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 97,
    },

    // BSC Mainnet (Chain ID: 56)
    bscMainnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("BSC_MAINNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 56,
    },
  },

  etherscan: {
    apiKey: {
      bsc: configVariable("BSCSCAN_API_KEY"),
      bscTestnet: configVariable("BSCSCAN_API_KEY"),
    },
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
      {
        network: "bscMainnet",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com",
        },
      },
    ],
  },
});
