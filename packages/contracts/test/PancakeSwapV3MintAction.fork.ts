import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

// ─── Forked-mainnet test (core deliverable) ──────────────────────────────────
// Opens a real PancakeSwap V3 LP position from the vault (explicit range and
// preset width), asserting the vault owns the NFT, the token-id lands in a
// context slot, the ticks bracket correctly, and NPM allowances reset to 0.

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
  tokenA: string,
  tokenB: string,
  fee: number,
  rangeMode: number,
  tickLower: number,
  tickUpper: number,
  tickDelta: number,
  amountA: bigint,
  amountB: bigint,
  tokenIdToSlot: number,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "uint8", "int24", "int24", "int24", "uint256", "uint256", "uint32"],
    [tokenA, tokenB, fee, rangeMode, tickLower, tickUpper, tickDelta, amountA, amountB, tokenIdToSlot],
  );
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

forkDescribe("PancakeSwapV3MintAction (fork)", function () {
  this.timeout(180_000);

  const ERC20_ABI = [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function deposit() payable",
  ];
  const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
  const POOL_ABI = [
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16,uint16,uint16,uint32,bool)",
    "function tickSpacing() view returns (int24)",
  ];
  const NPM_ABI = [
    "function ownerOf(uint256) view returns (address)",
    "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256, uint256, uint128, uint128)",
  ];

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
    const action = await ethers.deployContract("PancakeSwapV3MintAction", [await registry.getAddress()]);

    return { ethers, owner, vault, action };
  }

  async function fund(ethers: any, owner: any, vault: string) {
    // 200 USDT via whale.
    await ethers.provider.send("hardhat_impersonateAccount", [USDT_WHALE]);
    await ethers.provider.send("hardhat_setBalance", [USDT_WHALE, "0xDE0B6B3A7640000"]);
    const whale = await ethers.getSigner(USDT_WHALE);
    await (await new ethers.Contract(USDT, ERC20_ABI, whale).transfer(vault, ethers.parseEther("200"))).wait();
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [USDT_WHALE]);
    // 0.3 WBNB by wrapping.
    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, owner);
    await (await wbnb.deposit({ value: ethers.parseEther("0.3") })).wait();
    await (await wbnb.transfer(vault, ethers.parseEther("0.3"))).wait();
  }

  async function poolFor(ethers: any): Promise<{ fee: number; tick: number; spacing: number }> {
    const f = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, ethers.provider);
    for (const fee of FEE_TIERS) {
      const pool = await f.getPool(USDT, WBNB, fee);
      if (pool !== ethers.ZeroAddress) {
        const p = new ethers.Contract(pool, POOL_ABI, ethers.provider);
        const s = await p.slot0();
        return { fee, tick: Number(s.tick), spacing: Number(await p.tickSpacing()) };
      }
    }
    throw new Error("no USDT/WBNB pool");
  }

  function roundDown(t: number, s: number) {
    return Math.floor(t / s) * s;
  }
  function roundUp(t: number, s: number) {
    return Math.ceil(t / s) * s;
  }

  it("mints an explicit-range position; vault owns the NFT; token-id → slot; allowances reset", async function () {
    const { ethers, owner, vault, action } = await deploy();
    await fund(ethers, owner, await vault.getAddress());
    const { fee, tick, spacing } = await poolFor(ethers);
    const tickLower = roundDown(tick - 50 * spacing, spacing);
    const tickUpper = roundUp(tick + 50 * spacing, spacing);

    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeMintParams(USDT, WBNB, fee, 0, tickLower, tickUpper, 0, ethers.parseEther("100"), ethers.parseEther("0.15"), 0),
      ),
    ]);
    await vault.executeAutomation(0);

    const tokenId = abiCoder.decode(["uint256"], (await vault.getContext())[0])[0] as bigint;
    expect(tokenId).to.be.greaterThan(0n);

    const npm = new ethers.Contract(PCS_NPM, NPM_ABI, ethers.provider);
    expect(await npm.ownerOf(tokenId)).to.equal(await vault.getAddress());
    const pos = await npm.positions(tokenId);
    expect(Number(pos.tickLower)).to.equal(tickLower);
    expect(Number(pos.tickUpper)).to.equal(tickUpper);

    const usdt = new ethers.Contract(USDT, ERC20_ABI, ethers.provider);
    const wbnb = new ethers.Contract(WBNB, ERC20_ABI, ethers.provider);
    expect(await usdt.allowance(await vault.getAddress(), PCS_NPM)).to.equal(0n);
    expect(await wbnb.allowance(await vault.getAddress(), PCS_NPM)).to.equal(0n);
  });

  it("mints a preset-width position centered on the live tick (on-chain slot0), token-id → slot", async function () {
    const { ethers, owner, vault, action } = await deploy();
    await fund(ethers, owner, await vault.getAddress());
    const { fee, tick, spacing } = await poolFor(ethers);
    const tickDelta = 40 * spacing;

    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeMintParams(USDT, WBNB, fee, 1, 0, 0, tickDelta, ethers.parseEther("100"), ethers.parseEther("0.15"), 0),
      ),
    ]);
    await vault.executeAutomation(0);

    const tokenId = abiCoder.decode(["uint256"], (await vault.getContext())[0])[0] as bigint;
    const npm = new ethers.Contract(PCS_NPM, NPM_ABI, ethers.provider);
    expect(await npm.ownerOf(tokenId)).to.equal(await vault.getAddress());

    const pos = await npm.positions(tokenId);
    const lower = Number(pos.tickLower);
    const upper = Number(pos.tickUpper);
    // Brackets the live tick, spacing-aligned, rounded outward.
    expect(lower % spacing).to.equal(0);
    expect(upper % spacing).to.equal(0);
    expect(lower).to.be.lessThanOrEqual(tick);
    expect(upper).to.be.greaterThanOrEqual(tick);
    expect(lower).to.be.lessThanOrEqual(roundDown(tick - tickDelta, spacing));
    expect(upper).to.be.greaterThanOrEqual(roundUp(tick + tickDelta, spacing));
  });
});
