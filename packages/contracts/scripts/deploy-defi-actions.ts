/**
 * Incrementally deploys ONLY the DeFi-actions Epic contracts (the two protocol
 * registries + nine action contracts) to an already-running fork, and MERGES
 * their addresses into the existing `deployments/fork-latest.json` — WITHOUT
 * touching the factory / fee registry / vault implementation or existing vaults.
 *
 * Use this when the base system is already deployed and you only need to add the
 * new DeFi actions (so the StepType seed gets distinct, real addresses instead
 * of colliding zero-address placeholders).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-defi-actions.ts --network localhost
 */
import { network } from "hardhat";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Live BSC protocol addresses (present on the fork).
const AAVE_POOL_ADDRESSES_PROVIDER = "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D";
const PCS_SWAP_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const PCS_POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const PCS_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

async function main() {
  const networkName = process.env.HARDHAT_NETWORK ?? "localhost";
  const { ethers } = await network.connect(networkName);
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}\nNetwork:  ${networkName}\n`);

  async function deploy(name: string, args: unknown[] = []) {
    const c = await ethers.deployContract(name, args);
    const addr = await c.getAddress();
    console.log(`  ${name}: ${addr}`);
    return addr;
  }

  console.log("Deploying Aave V3 registry + actions...");
  const AaveV3Registry = await deploy("AaveV3Registry", [AAVE_POOL_ADDRESSES_PROVIDER]);
  const AaveV3SupplyAction = await deploy("AaveV3SupplyAction", [AaveV3Registry]);
  const AaveV3WithdrawAction = await deploy("AaveV3WithdrawAction", [AaveV3Registry]);
  const AaveV3BorrowAction = await deploy("AaveV3BorrowAction", [AaveV3Registry]);
  const AaveV3RepayAction = await deploy("AaveV3RepayAction", [AaveV3Registry]);

  console.log("Deploying PancakeSwap V3 registry + actions...");
  const PancakeSwapV3Registry = await deploy("PancakeSwapV3Registry", [
    PCS_SWAP_ROUTER,
    PCS_POSITION_MANAGER,
    PCS_FACTORY,
  ]);
  const PancakeSwapV3SwapAction = await deploy("PancakeSwapV3SwapAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3MintAction = await deploy("PancakeSwapV3MintAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3IncreaseLiquidityAction = await deploy("PancakeSwapV3IncreaseLiquidityAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3DecreaseLiquidityAction = await deploy("PancakeSwapV3DecreaseLiquidityAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3CollectAction = await deploy("PancakeSwapV3CollectAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3SwapToRangeRatioAction = await deploy("PancakeSwapV3SwapToRangeRatioAction", [PancakeSwapV3Registry]);

  console.log("Deploying Wick-&-Wait rebalance condition...");
  const WickWaitRebalanceCondition = await deploy("WickWaitRebalanceCondition", [PancakeSwapV3Registry]);

  const additions = {
    AaveV3Registry,
    AaveV3SupplyAction,
    AaveV3WithdrawAction,
    AaveV3BorrowAction,
    AaveV3RepayAction,
    PancakeSwapV3Registry,
    PancakeSwapV3SwapAction,
    PancakeSwapV3MintAction,
    PancakeSwapV3IncreaseLiquidityAction,
    PancakeSwapV3DecreaseLiquidityAction,
    PancakeSwapV3CollectAction,
    PancakeSwapV3SwapToRangeRatioAction,
    WickWaitRebalanceCondition,
  };

  const outPath = join(__dirname, "../deployments/fork-latest.json");
  const existing = JSON.parse(readFileSync(outPath, "utf-8"));
  const merged = { ...existing, ...additions };
  writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");

  console.log(`\nMerged ${Object.keys(additions).length} addresses into ${outPath}`);
  console.log("Next: re-seed StepTypes (pnpm --filter backend prisma:seed) and reload the editor.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
