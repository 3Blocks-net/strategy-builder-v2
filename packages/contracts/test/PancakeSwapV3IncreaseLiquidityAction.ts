import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

const { ethers } = await network.connect();

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;
const FEE = 500;

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

function encodeIncreaseParams(
  tokenA: string, tokenB: string, tokenIdFromSlot: number,
  amountADesired: bigint, amountAFromSlot: number,
  amountBDesired: bigint, amountBFromSlot: number,
): string {
  return abiCoder.encode(
    ["address", "address", "uint32", "uint256", "uint32", "uint256", "uint32"],
    [tokenA, tokenB, tokenIdFromSlot, amountADesired, amountAFromSlot, amountBDesired, amountBFromSlot],
  );
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

describe("PancakeSwapV3IncreaseLiquidityAction", function () {
  async function fixture() {
    const [owner] = await ethers.getSigners();
    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

    const MockToken = await ethers.getContractFactory("MockERC20");
    let tokenA = await MockToken.deploy("A", "A", ethers.parseEther("1000000"));
    let tokenB = await MockToken.deploy("B", "B", ethers.parseEther("1000000"));
    if ((await tokenA.getAddress()).toLowerCase() > (await tokenB.getAddress()).toLowerCase()) {
      [tokenA, tokenB] = [tokenB, tokenA];
    }

    const npm = await ethers.deployContract("MockNonfungiblePositionManager");
    const pcsFactory = await ethers.deployContract("MockPancakeV3Factory");
    const registry = await ethers.deployContract("PancakeSwapV3Registry", [
      "0x0000000000000000000000000000000000000001",
      await npm.getAddress(),
      await pcsFactory.getAddress(),
    ]);
    const mint = await ethers.deployContract("PancakeSwapV3MintAction", [await registry.getAddress()]);
    const increase = await ethers.deployContract("PancakeSwapV3IncreaseLiquidityAction", [await registry.getAddress()]);

    return { owner, vault, tokenA, tokenB, npm, registry, mint, increase };
  }

  async function fund(vault: any, tokenA: any, tokenB: any, amt: string) {
    await tokenA.transfer(await vault.getAddress(), ethers.parseEther(amt));
    await tokenB.transfer(await vault.getAddress(), ethers.parseEther(amt));
  }

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("PancakeSwapV3IncreaseLiquidityAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revertedWith("registry=0");
  });

  it("increases an existing position's liquidity, pulling both tokens; allowances reset", async function () {
    const { vault, tokenA, tokenB, npm, mint, increase } = await fixture();
    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);

    // Mint a position (token-id → slot 0).
    await fund(vault, tokenA, tokenB, "50");
    await vault.createOwnerAutomation([
      actionStep(await mint.getAddress(), encodeMintParams(
        await tokenA.getAddress(), await tokenB.getAddress(), FEE, 0, -1000, 1000, 0,
        ethers.parseEther("10"), ethers.parseEther("10"), 0,
      )),
    ]);
    await vault.executeAutomation(0);
    const tokenId = abiCoder.decode(["uint256"], (await vault.getContext())[0])[0] as bigint;
    const liqBefore = (await npm.positionOf(tokenId)).liquidity as bigint;

    // Increase using the token-id from slot 0.
    await vault.createOwnerAutomation([
      actionStep(await increase.getAddress(), encodeIncreaseParams(
        await tokenA.getAddress(), await tokenB.getAddress(), 0,
        ethers.parseEther("5"), NO_SLOT, ethers.parseEther("5"), NO_SLOT,
      )),
    ]);
    await vault.executeAutomation(1);

    const liqAfter = (await npm.positionOf(tokenId)).liquidity as bigint;
    expect(liqAfter).to.be.greaterThan(liqBefore);
    // Both token amounts pulled from the vault (10 each minted, 5 each increased = 15 of 50).
    expect(await tokenA.balanceOf(await npm.getAddress())).to.equal(ethers.parseEther("15"));
    expect(await tokenA.allowance(await vault.getAddress(), await npm.getAddress())).to.equal(0n);
    expect(await tokenB.allowance(await vault.getAddress(), await npm.getAddress())).to.equal(0n);
  });

  it("uses the full vault balance when a desired amount is 0", async function () {
    const { vault, tokenA, tokenB, npm, mint, increase } = await fixture();
    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);
    await fund(vault, tokenA, tokenB, "30");
    await vault.createOwnerAutomation([
      actionStep(await mint.getAddress(), encodeMintParams(
        await tokenA.getAddress(), await tokenB.getAddress(), FEE, 0, -100, 100, 0,
        ethers.parseEther("10"), ethers.parseEther("10"), 0,
      )),
    ]);
    await vault.executeAutomation(0);

    // Vault has 20 of each left; increase with full balance.
    await vault.createOwnerAutomation([
      actionStep(await increase.getAddress(), encodeIncreaseParams(
        await tokenA.getAddress(), await tokenB.getAddress(), 0, 0n, NO_SLOT, 0n, NO_SLOT,
      )),
    ]);
    await vault.executeAutomation(1);
    expect(await tokenA.balanceOf(await vault.getAddress())).to.equal(0n);
  });

  it("reverts when the token-id slot is NO_SLOT (required)", async function () {
    const { vault, tokenA, tokenB, increase } = await fixture();
    await fund(vault, tokenA, tokenB, "10");
    await vault.createOwnerAutomation([
      actionStep(await increase.getAddress(), encodeIncreaseParams(
        await tokenA.getAddress(), await tokenB.getAddress(), NO_SLOT, 1n, NO_SLOT, 1n, NO_SLOT,
      )),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });
});
