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
 * The freshly deployed step targets are curated on the CuratedRegistry the base
 * deploy left behind — a step target that is not on that list cannot be used by
 * a standard-mode vault, so adding contracts without curating them would produce
 * exactly the broken half-state this script exists to avoid.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-defi-actions.ts --network localhost
 */
import { network } from "hardhat";
import { readFileSync, writeFileSync } from "fs";
import { deploymentOutputPath } from "./deployment-file.js";
import {
  asCuratedRegistry,
  curateTargets,
  curationRecord,
  mergeCurationRecords,
  toCatalogTarget,
  type CatalogTarget,
} from "./curated-catalog.js";

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

  // Read the base deploy first: without a CuratedRegistry there is nowhere to
  // curate the new targets, and finding that out after eleven deploys would
  // leave the chain with contracts no standard vault can use.
  const outPath = deploymentOutputPath();
  const existing = JSON.parse(readFileSync(outPath, "utf-8"));
  const curatedRegistryAddr: string | undefined = existing.CuratedRegistry;
  if (!curatedRegistryAddr) {
    throw new Error(
      `${outPath} names no CuratedRegistry, so it predates the curation gate. ` +
        `Run a full deploy (pnpm contracts:deploy:fork) instead of this incremental one.`,
    );
  }

  // Freshly deployed targets, kept alongside their interfaces so their curated
  // kind is read off the contract rather than typed out a second time.
  const targets: CatalogTarget[] = [];

  async function deploy(name: string, args: unknown[] = []) {
    const c = await ethers.deployContract(name, args);
    const addr = await c.getAddress();
    console.log(`  ${name}: ${addr}`);
    return { address: addr, contract: c };
  }

  /** Deploy a step target — a contract a vault calls as a condition or action. */
  async function deployTarget(name: string, args: unknown[] = []) {
    const { address, contract } = await deploy(name, args);
    targets.push(toCatalogTarget(name, address, contract.interface));
    return address;
  }

  console.log("Deploying Aave V3 registry + actions...");
  const AaveV3Registry = (await deploy("AaveV3Registry", [AAVE_POOL_ADDRESSES_PROVIDER])).address;
  const AaveV3SupplyAction = await deployTarget("AaveV3SupplyAction", [AaveV3Registry]);
  const AaveV3WithdrawAction = await deployTarget("AaveV3WithdrawAction", [AaveV3Registry]);
  const AaveV3BorrowAction = await deployTarget("AaveV3BorrowAction", [AaveV3Registry]);
  const AaveV3RepayAction = await deployTarget("AaveV3RepayAction", [AaveV3Registry]);

  console.log("Deploying PancakeSwap V3 registry + actions...");
  const PancakeSwapV3Registry = (
    await deploy("PancakeSwapV3Registry", [PCS_SWAP_ROUTER, PCS_POSITION_MANAGER, PCS_FACTORY])
  ).address;
  const PancakeSwapV3SwapAction = await deployTarget("PancakeSwapV3SwapAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3MintAction = await deployTarget("PancakeSwapV3MintAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3IncreaseLiquidityAction = await deployTarget("PancakeSwapV3IncreaseLiquidityAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3DecreaseLiquidityAction = await deployTarget("PancakeSwapV3DecreaseLiquidityAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3CollectAction = await deployTarget("PancakeSwapV3CollectAction", [PancakeSwapV3Registry]);
  const PancakeSwapV3SwapToRangeRatioAction = await deployTarget("PancakeSwapV3SwapToRangeRatioAction", [PancakeSwapV3Registry]);

  console.log("Deploying Wick-&-Wait rebalance condition...");
  const WickWaitRebalanceCondition = await deployTarget("WickWaitRebalanceCondition", [PancakeSwapV3Registry]);

  // Curate what was just deployed. Each run mints new addresses, so nothing is
  // normally on the list yet; curateTargets still reads the state first so a
  // rerun against a registry that already knows a target skips it instead of
  // reverting with TargetAlreadyCurated halfway through.
  console.log(`Curating on CuratedRegistry ${curatedRegistryAddr}...`);
  const curatedRegistry = await ethers.getContractAt("CuratedRegistry", curatedRegistryAddr);
  await curateTargets(asCuratedRegistry(curatedRegistry), targets, deployer.address);

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
    // Folded into what the base deploy curated: the targets it listed are still
    // on the registry, so dropping them here would report them as uncurated.
    curatedTargets: mergeCurationRecords(
      existing.curatedTargets,
      curationRecord(curatedRegistryAddr, targets),
    ),
  };

  const merged = { ...existing, ...additions };
  writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");

  console.log(`\nMerged ${Object.keys(additions).length - 1} addresses into ${outPath}`);
  console.log("Next: re-seed StepTypes (pnpm --filter backend prisma:seed) and reload the editor.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
