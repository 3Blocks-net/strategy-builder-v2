import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

// ─── Forked-mainnet test: the second caller of the shared guard ──────────────
// SwapToRangeRatio must be protected by the SAME implementation as SwapAction —
// the inventory claim of issue #19 (PRD S5) is only worth something if it holds
// against a live pool. Requires an archive BSC RPC.

const RUN_FORK = !!process.env.BSC_MAINNET_RPC_URL;
const forkDescribe = RUN_FORK ? describe : describe.skip;

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;

const PCS_SWAP_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const PCS_NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const PCS_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT_WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const FEE_TIERS = [100, 500, 2500, 10000];

const TICK_DELTA = 1000;
const TOLERANCE_BPS = 100;
const TWAP_WINDOW = 300;
const MAX_TWAP_WINDOW = 900; // measured ceiling, see SlippageGuard.sol
const GAS_LIMIT = 5_000_000;

function encodeParams(
  tokenA: string,
  tokenB: string,
  fee: number,
  slippageToleranceBps = TOLERANCE_BPS,
  twapWindow = TWAP_WINDOW,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "int24", "uint16", "uint32"],
    [tokenA, tokenB, fee, TICK_DELTA, slippageToleranceBps, twapWindow],
  );
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

forkDescribe("PancakeSwapV3SwapToRangeRatioAction (fork)", function () {
  this.timeout(180_000);

  const ERC20_ABI = [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
  ];
  const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
  const POOL_ABI = ["function observe(uint32[]) view returns (int56[], uint160[])"];

  async function deploy() {
    const { ethers } = await network.connect("bscFork");
    const [owner] = await ethers.getSigners();

    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

    const registry = await ethers.deployContract("PancakeSwapV3Registry", [
      PCS_SWAP_ROUTER,
      PCS_NPM,
      PCS_FACTORY,
    ]);
    const action = await ethers.deployContract("PancakeSwapV3SwapToRangeRatioAction", [
      await registry.getAddress(),
    ]);
    const guard = await ethers.getContractAt("SlippageGuard", await vault.getAddress());

    const f = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, ethers.provider);
    let fee = 0;
    for (const tier of FEE_TIERS) {
      if ((await f.getPool(USDT, WBNB, tier)) !== ethers.ZeroAddress) {
        fee = tier;
        break;
      }
    }
    if (fee === 0) throw new Error("no USDT/WBNB pool found");

    return { ethers, vault, action, guard, fee, pool: await f.getPool(USDT, WBNB, fee) };
  }

  async function fundUsdt(ethers: any, to: string, amount: bigint) {
    await ethers.provider.send("hardhat_impersonateAccount", [USDT_WHALE]);
    await ethers.provider.send("hardhat_setBalance", [USDT_WHALE, "0xDE0B6B3A7640000"]);
    const whale = await ethers.getSigner(USDT_WHALE);
    await (await new ethers.Contract(USDT, ERC20_ABI, whale).transfer(to, amount)).wait();
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [USDT_WHALE]);
  }

  function guardEvent(guard: any, receipt: any) {
    return receipt.logs
      .map((log: any) => {
        try {
          return guard.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "SwapMinOutEnforced");
  }

  it("sizes the position and enforces the shared minimum-out against the live pool", async function () {
    const { ethers, vault, action, guard, fee, pool } = await deploy();
    const vaultAddr = await vault.getAddress();
    await fundUsdt(ethers, vaultAddr, ethers.parseEther("1000"));

    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeParams(USDT, WBNB, fee)),
    ]);
    const receipt = await (await vault.executeAutomation(0, { gasLimit: GAS_LIMIT })).wait();

    // Half the deposit is now the other token — the sizing swap ran.
    const usdt = new ethers.Contract(USDT, ERC20_ABI, ethers.provider);
    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, ethers.provider);
    expect((await usdt.balanceOf(vaultAddr)) as bigint).to.be.greaterThan(0n);
    expect((await wbnb.balanceOf(vaultAddr)) as bigint).to.be.greaterThan(0n);
    expect(await usdt.allowance(vaultAddr, PCS_SWAP_ROUTER)).to.equal(0n);

    // …under the same guard, with the same TWAP reference and full tolerance.
    const emitted = guardEvent(guard, receipt);
    expect(emitted, "guard event must be emitted").to.not.equal(undefined);
    expect(emitted!.args.pool).to.equal(pool);
    expect(emitted!.args.spotFallback).to.equal(false);
    expect(emitted!.args.effectiveToleranceBps).to.equal(BigInt(TOLERANCE_BPS));
    expect(emitted!.args.minOut).to.be.greaterThan(0n);
  });

  // Same property as in PancakeSwapV3SwapAction.fork.ts, asserted for the second
  // caller: the longest window a user may pick is one the live pool serves, so
  // picking it prices against the TWAP at the full tolerance instead of silently
  // downgrading to the spot fallback. The fallback path itself is covered
  // deterministically in SlippageGuard.ts, where the oracle can be made to fail.
  it("prices the maximum allowed window against the live TWAP, not the fallback", async function () {
    const { ethers, vault, action, guard, fee, pool } = await deploy();
    await fundUsdt(ethers, await vault.getAddress(), ethers.parseEther("1000"));

    const poolContract = new ethers.Contract(pool, POOL_ABI, ethers.provider);
    let covers = true;
    try {
      await poolContract.observe([MAX_TWAP_WINDOW, 0]);
    } catch {
      covers = false;
    }
    expect(covers).to.equal(
      true,
      `USDT/WBNB fee tier ${fee} cannot serve a ${MAX_TWAP_WINDOW}s window — ` +
        "MAX_TWAP_WINDOW has drifted past what live pools reach; re-measure it",
    );

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeParams(USDT, WBNB, fee, TOLERANCE_BPS, MAX_TWAP_WINDOW),
      ),
    ]);
    const receipt = await (await vault.executeAutomation(0, { gasLimit: GAS_LIMIT })).wait();

    const emitted = guardEvent(guard, receipt);
    expect(emitted, "guard event must be emitted").to.not.equal(undefined);
    expect(emitted!.args.spotFallback).to.equal(false);
    expect(emitted!.args.effectiveToleranceBps).to.equal(BigInt(TOLERANCE_BPS));
  });
});
