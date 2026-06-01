/**
 * Deploys the full Strategy Builder system to a forked BSC chain.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-fork.ts --network bscFork
 *   pnpm deploy:fork
 */
import { network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── BSC Mainnet token addresses (available on fork) ──────────────────────

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const TEST_WALLET = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";

// ─── Configurable parameters ──────────────────────────────────────────────

const DEPOSIT_FEE_BPS = parseInt(process.env.DEPOSIT_FEE_BPS ?? "100", 10);   // 1%
const WITHDRAW_FEE_BPS = parseInt(process.env.WITHDRAW_FEE_BPS ?? "50", 10);  // 0.5%

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const networkName = process.env.HARDHAT_NETWORK ?? "localhost";
  const { ethers } = await network.connect(networkName);
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;

  console.log(`\nDeployer: ${deployer.address}`);
  console.log(`Network:  ${networkName}\n`);

  // 1. Deploy FeeRegistry
  console.log("Deploying FeeRegistry...");
  const feeRegistry = await ethers.deployContract("FeeRegistry");
  const feeRegistryAddr = await feeRegistry.getAddress();
  console.log(`  FeeRegistry: ${feeRegistryAddr}`);

  // 2. Configure FeeRegistry
  console.log("Configuring FeeRegistry...");
  await (await feeRegistry.addAcceptedToken(USDT, 18)).wait();
  console.log(`  Added USDT (${USDT}, 18 decimals)`);
  await (await feeRegistry.addAcceptedToken(WBNB, 18)).wait();
  console.log(`  Added WBNB (${WBNB}, 18 decimals)`);
  await (await feeRegistry.setDepositFeeBps(DEPOSIT_FEE_BPS)).wait();
  console.log(`  Deposit fee: ${DEPOSIT_FEE_BPS} bps (${(DEPOSIT_FEE_BPS / 100).toFixed(2)}%)`);
  await (await feeRegistry.setWithdrawFeeBps(WITHDRAW_FEE_BPS)).wait();
  console.log(`  Withdraw fee: ${WITHDRAW_FEE_BPS} bps (${(WITHDRAW_FEE_BPS / 100).toFixed(2)}%)`);

  // 3. Deploy vault implementation
  console.log("Deploying StrategyBuilderVault (implementation)...");
  const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
  const vaultImplAddr = await vaultImpl.getAddress();
  console.log(`  StrategyBuilderVault: ${vaultImplAddr}`);

  // 4. Deploy factory
  console.log("Deploying StrategyBuilderVaultFactory...");
  const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
  const factoryAddr = await factory.getAddress();
  console.log(`  StrategyBuilderVaultFactory: ${factoryAddr}`);

  // 5. Wire factory
  console.log("Wiring factory...");
  await (await factory.setVaultImplementation(vaultImplAddr)).wait();
  console.log(`  setVaultImplementation(${vaultImplAddr})`);
  await (await factory.setFeeRegistry(feeRegistryAddr)).wait();
  console.log(`  setFeeRegistry(${feeRegistryAddr})`);

  // 6. Deploy example conditions
  console.log("Deploying example conditions...");
  const tokenBalanceCondition = await ethers.deployContract("TokenBalanceCondition");
  const tokenBalanceConditionAddr = await tokenBalanceCondition.getAddress();
  console.log(`  TokenBalanceCondition: ${tokenBalanceConditionAddr}`);

  const intervalCondition = await ethers.deployContract("IntervalCondition");
  const intervalConditionAddr = await intervalCondition.getAddress();
  console.log(`  IntervalCondition: ${intervalConditionAddr}`);

  const timerCondition = await ethers.deployContract("TimerCondition");
  const timerConditionAddr = await timerCondition.getAddress();
  console.log(`  TimerCondition: ${timerConditionAddr}`);

  // 7. Deploy example actions
  console.log("Deploying example actions...");
  const erc20TransferAction = await ethers.deployContract("ERC20TransferAction");
  const erc20TransferActionAddr = await erc20TransferAction.getAddress();
  console.log(`  ERC20TransferAction: ${erc20TransferActionAddr}`);

  const feeDepositAction = await ethers.deployContract("FeeDepositAction");
  const feeDepositActionAddr = await feeDepositAction.getAddress();
  console.log(`  FeeDepositAction: ${feeDepositActionAddr}`);

  // 8. Seed test wallet with tokens via impersonation
  //    Use a raw JsonRpcProvider to bypass Hardhat's local account signing
  console.log(`\nSeeding test wallet ${TEST_WALLET}...`);

  const { JsonRpcProvider: RawProvider, Contract: RawContract, Interface: RawInterface } = await import("ethers");
  const rawProvider = new RawProvider("http://127.0.0.1:8545");
  const iface = new RawInterface([
    "function transfer(address to, uint256 amount) returns (bool)",
    "function deposit() payable",
    "function balanceOf(address) view returns (uint256)",
  ]);

  // Helper: send impersonated TX directly via eth_sendTransaction
  async function sendAs(from: string, to: string, data: string, value = "0x0") {
    const txHash = await rawProvider.send("eth_sendTransaction", [{ from, to, data, value }]);
    await rawProvider.waitForTransaction(txHash);
  }

  // USDT — impersonate Binance Hot Wallet
  const usdtWhale = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
  await rawProvider.send("hardhat_impersonateAccount", [usdtWhale]);
  await rawProvider.send("hardhat_setBalance", [usdtWhale, "0xDE0B6B3A7640000"]); // 1 BNB for gas
  const usdtAmount = ethers.parseEther("150");
  const transferData = iface.encodeFunctionData("transfer", [TEST_WALLET, usdtAmount]);
  await sendAs(usdtWhale, USDT, transferData);
  await rawProvider.send("hardhat_stopImpersonatingAccount", [usdtWhale]);
  console.log(`  Sent 150 USDT to ${TEST_WALLET}`);

  // WBNB — wrap BNB from deployer, then transfer to test wallet
  const depositData = iface.encodeFunctionData("deposit");
  const wbnbAmount = ethers.parseEther("1");
  const wbnbHex = "0x" + wbnbAmount.toString(16);
  await sendAs(deployer.address, WBNB, depositData, wbnbHex);
  const wbnbTransferData = iface.encodeFunctionData("transfer", [TEST_WALLET, wbnbAmount]);
  await sendAs(deployer.address, WBNB, wbnbTransferData);
  console.log(`  Sent 1 WBNB to ${TEST_WALLET}`);

  // Verify balances
  const balAbi = ["function balanceOf(address) view returns (uint256)"];
  const usdtCheck = new RawContract(USDT, balAbi, rawProvider);
  const wbnbCheck = new RawContract(WBNB, balAbi, rawProvider);
  const usdtBal = await usdtCheck.balanceOf(TEST_WALLET);
  const wbnbBal = await wbnbCheck.balanceOf(TEST_WALLET);
  console.log(`  Balances: ${ethers.formatEther(usdtBal)} USDT, ${ethers.formatEther(wbnbBal)} WBNB`);

  await rawProvider.destroy();

  // ─── Output ─────────────────────────────────────────────────────────────

  const addresses = {
    FeeRegistry: feeRegistryAddr,
    StrategyBuilderVault: vaultImplAddr,
    StrategyBuilderVaultFactory: factoryAddr,
    TokenBalanceCondition: tokenBalanceConditionAddr,
    IntervalCondition: intervalConditionAddr,
    TimerCondition: timerConditionAddr,
    ERC20TransferAction: erc20TransferActionAddr,
    FeeDepositAction: feeDepositActionAddr,
    config: {
      depositFeeBps: DEPOSIT_FEE_BPS,
      withdrawFeeBps: WITHDRAW_FEE_BPS,
      acceptedTokens: { USDT, WBNB },
    },
  };

  // Write JSON
  const outDir = join(__dirname, "../deployments");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "fork-latest.json");
  writeFileSync(outPath, JSON.stringify(addresses, null, 2) + "\n");

  // Print summary
  console.log(`
${"═".repeat(55)}
 Deployed Contract Addresses
${"═".repeat(55)}

FeeRegistry:                 ${feeRegistryAddr}
StrategyBuilderVault (impl): ${vaultImplAddr}
StrategyBuilderVaultFactory: ${factoryAddr}
TokenBalanceCondition:       ${tokenBalanceConditionAddr}
IntervalCondition:           ${intervalConditionAddr}
TimerCondition:              ${timerConditionAddr}
ERC20TransferAction:         ${erc20TransferActionAddr}
FeeDepositAction:            ${feeDepositActionAddr}

${"═".repeat(55)}
 Backend .env  (packages/backend/.env)
${"═".repeat(55)}

RPC_URL=http://localhost:8545
FACTORY_ADDRESS=${factoryAddr}
FEE_REGISTRY_ADDRESS=${feeRegistryAddr}

${"═".repeat(55)}
 Frontend .env  (packages/frontend/.env)
${"═".repeat(55)}

VITE_FACTORY_ADDRESS=${factoryAddr}

${"═".repeat(55)}
 Saved to: ${outPath}
${"═".repeat(55)}
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
