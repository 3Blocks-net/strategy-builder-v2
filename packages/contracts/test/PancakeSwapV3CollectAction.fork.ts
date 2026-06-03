import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

// ─── Forked-mainnet test (core deliverable) ──────────────────────────────────
// Mints a real PancakeSwap V3 position, generates trading fees with a large swap
// through the same fee tier, then Collect harvests the accrued fees into the
// vault (USDT balance increases). Requires an archive BSC RPC.

const RUN_FORK = !!process.env.BSC_MAINNET_RPC_URL;
const forkDescribe = RUN_FORK ? describe : describe.skip;

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;

const PCS_SWAP_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const PCS_NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const PCS_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const USDT_WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const FEE_TIERS = [100, 500, 2500, 10000];

function encodeMintParams(
  tokenA: string, tokenB: string, fee: number, rangeMode: number,
  tickLower: number, tickUpper: number, tickDelta: number,
  amountA: bigint, amountB: bigint, tokenIdToSlot: number,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "uint8", "int24", "int24", "int24", "uint256", "uint256", "uint32"],
    [tokenA, tokenB, fee, rangeMode, tickLower, tickUpper, tickDelta, amountA, amountB, tokenIdToSlot],
  );
}

function encodeSwapParams(tokenIn: string, tokenOut: string, fee: number, amountIn: bigint): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "uint256", "uint32", "uint32", "uint256", "uint32"],
    [tokenIn, tokenOut, fee, amountIn, NO_SLOT, NO_SLOT, 0n, NO_SLOT],
  );
}

function encodeCollectParams(tokenIdFromSlot: number): string {
  return abiCoder.encode(["uint32"], [tokenIdFromSlot]);
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

forkDescribe("PancakeSwapV3CollectAction (fork)", function () {
  this.timeout(180_000);

  const ERC20_ABI = [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function deposit() payable",
  ];
  const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
  const POOL_ABI = [
    "function slot0() view returns (uint160,int24 tick,uint16,uint16,uint16,uint32,bool)",
    "function tickSpacing() view returns (int24)",
  ];

  async function deploy() {
    const { ethers } = await network.connect("bscFork");
    const [owner] = await ethers.getSigners();
    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));
    const registry = await ethers.deployContract("PancakeSwapV3Registry", [PCS_SWAP_ROUTER, PCS_NPM, PCS_FACTORY]);
    const mint = await ethers.deployContract("PancakeSwapV3MintAction", [await registry.getAddress()]);
    const swap = await ethers.deployContract("PancakeSwapV3SwapAction", [await registry.getAddress()]);
    const collect = await ethers.deployContract("PancakeSwapV3CollectAction", [await registry.getAddress()]);
    return { ethers, owner, vault, mint, swap, collect };
  }

  async function fundUsdt(ethers: any, to: string, amount: bigint) {
    await ethers.provider.send("hardhat_impersonateAccount", [USDT_WHALE]);
    await ethers.provider.send("hardhat_setBalance", [USDT_WHALE, "0xDE0B6B3A7640000"]);
    const whale = await ethers.getSigner(USDT_WHALE);
    await (await new ethers.Contract(USDT, ERC20_ABI, whale).transfer(to, amount)).wait();
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [USDT_WHALE]);
  }

  async function poolFor(ethers: any) {
    const f = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, ethers.provider);
    for (const fee of FEE_TIERS) {
      const pool = await f.getPool(USDT, WBNB, fee);
      if (pool !== ethers.ZeroAddress) {
        const p = new ethers.Contract(pool, POOL_ABI, ethers.provider);
        const s = await p.slot0();
        return { fee, tick: Number(s.tick), spacing: Number(await p.tickSpacing()) };
      }
    }
    throw new Error("no pool");
  }

  it("harvests accrued fees from a position into the vault (balance increases)", async function () {
    const { ethers, owner, vault, mint, swap, collect } = await deploy();
    // Mint capital + WBNB, plus a large USDT amount to swap and generate fees.
    await fundUsdt(ethers, await vault.getAddress(), ethers.parseEther("5200"));
    const w = new ethers.Contract(WBNB, ERC20_ABI, owner);
    await (await w.deposit({ value: ethers.parseEther("0.3") })).wait();
    await (await w.transfer(await vault.getAddress(), ethers.parseEther("0.3"))).wait();

    const { fee, tick, spacing } = await poolFor(ethers);
    // Wide-ish range so the position stays in range across the swap.
    const tickLower = Math.floor((tick - 80 * spacing) / spacing) * spacing;
    const tickUpper = Math.ceil((tick + 80 * spacing) / spacing) * spacing;

    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);
    await vault.createOwnerAutomation([
      actionStep(await mint.getAddress(), encodeMintParams(
        USDT, WBNB, fee, 0, tickLower, tickUpper, 0, ethers.parseEther("200"), ethers.parseEther("0.3"), 0,
      )),
    ]);
    await vault.executeAutomation(0);

    // Generate fees: a large USDT→WBNB swap through the same fee tier (fee paid
    // in USDT accrues pro-rata to in-range liquidity, incl. our position).
    await vault.createOwnerAutomation([
      actionStep(await swap.getAddress(), encodeSwapParams(USDT, WBNB, fee, ethers.parseEther("5000"))),
    ]);
    await vault.executeAutomation(1);

    const usdt = new ethers.Contract(USDT, ERC20_ABI, ethers.provider);
    const usdtBefore = (await usdt.balanceOf(await vault.getAddress())) as bigint;

    // Collect harvests the accrued fees (NPM pokes the position on collect).
    await vault.createOwnerAutomation([
      actionStep(await collect.getAddress(), encodeCollectParams(0)),
    ]);
    await vault.executeAutomation(2);

    const usdtAfter = (await usdt.balanceOf(await vault.getAddress())) as bigint;
    expect(usdtAfter).to.be.greaterThan(usdtBefore); // accrued USDT fees harvested
  });
});
