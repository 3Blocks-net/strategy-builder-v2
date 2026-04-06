import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

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

  paths: {
    // Allow importing LayerZero contracts that are not exported via package.json "exports"
    sources: "./contracts",
  },

  networks: {
    // Local hardhat network
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
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
