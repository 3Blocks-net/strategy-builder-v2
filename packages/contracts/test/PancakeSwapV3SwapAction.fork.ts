import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

// ─── Forked-mainnet test (core deliverable, INVERTED) ────────────────────────
// Proves a swap with `amountOutMinimum = 0` EXECUTES on live PancakeSwap V3
// (does not revert on price movement), writes the output to a context slot, and
// resets the router allowance to 0. Requires an archive BSC RPC.

const RUN_FORK = !!process.env.BSC_MAINNET_RPC_URL;
const forkDescribe = RUN_FORK ? describe : describe.skip;

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;

// PancakeSwap V3 BSC addresses.
const PCS_SWAP_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const PCS_NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const PCS_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT_WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const FEE_TIERS = [100, 500, 2500, 10000];

function encodeSwapParams(
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: bigint,
  amountOutToSlot = NO_SLOT,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "uint256", "uint32", "uint32", "uint256", "uint32"],
    [tokenIn, tokenOut, fee, amountIn, NO_SLOT, amountOutToSlot, 0n, NO_SLOT],
  );
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

forkDescribe("PancakeSwapV3SwapAction (fork)", function () {
  this.timeout(180_000);

  const ERC20_ABI = [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
  ];
  const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];

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
    const action = await ethers.deployContract("PancakeSwapV3SwapAction", [await registry.getAddress()]);

    return { ethers, vault, registry, action };
  }

  async function fundUsdt(ethers: any, to: string, amount: bigint) {
    await ethers.provider.send("hardhat_impersonateAccount", [USDT_WHALE]);
    await ethers.provider.send("hardhat_setBalance", [USDT_WHALE, "0xDE0B6B3A7640000"]);
    const whale = await ethers.getSigner(USDT_WHALE);
    await (await new ethers.Contract(USDT, ERC20_ABI, whale).transfer(to, amount)).wait();
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [USDT_WHALE]);
  }

  async function firstValidFee(ethers: any): Promise<number> {
    const f = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, ethers.provider);
    for (const fee of FEE_TIERS) {
      const pool = await f.getPool(USDT, WBNB, fee);
      if (pool !== ethers.ZeroAddress) return fee;
    }
    throw new Error("no USDT/WBNB pool found");
  }

  it("executes a USDT→WBNB swap with amountOutMinimum = 0; output → slot; allowance reset", async function () {
    const { ethers, vault, registry, action } = await deploy();
    const amountIn = ethers.parseEther("100"); // 100 USDT
    await fundUsdt(ethers, await vault.getAddress(), amountIn);

    const fee = await firstValidFee(ethers);
    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);

    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, ethers.provider);
    const before = (await wbnb.balanceOf(await vault.getAddress())) as bigint;

    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeSwapParams(USDT, WBNB, fee, amountIn, 0)),
    ]);
    await vault.executeAutomation(0); // must NOT revert (amountOutMinimum = 0)

    const after = (await wbnb.balanceOf(await vault.getAddress())) as bigint;
    const received = after - before;
    expect(received).to.be.greaterThan(0n); // vault received WBNB

    // Output amount written to the slot, matching the received balance.
    const written = abiCoder.decode(["uint256"], (await vault.getContext())[0])[0] as bigint;
    expect(written).to.equal(received);

    // Approval hygiene.
    const usdt = new ethers.Contract(USDT, ERC20_ABI, ethers.provider);
    expect(await usdt.allowance(await vault.getAddress(), PCS_SWAP_ROUTER)).to.equal(0n);
  });

  it("sweeps the full USDT balance with the amountIn = 0 toggle", async function () {
    const { ethers, vault, action } = await deploy();
    await fundUsdt(ethers, await vault.getAddress(), ethers.parseEther("50"));
    const fee = await firstValidFee(ethers);

    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeSwapParams(USDT, WBNB, fee, 0n)),
    ]);
    await vault.executeAutomation(0);

    const usdt = new ethers.Contract(USDT, ERC20_ABI, ethers.provider);
    expect(await usdt.balanceOf(await vault.getAddress())).to.equal(0n); // fully swept
  });
});
