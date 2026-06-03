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

function encodeCollectParams(tokenIdFromSlot: number): string {
  return abiCoder.encode(["uint32"], [tokenIdFromSlot]);
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

describe("PancakeSwapV3CollectAction", function () {
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
    const collect = await ethers.deployContract("PancakeSwapV3CollectAction", [await registry.getAddress()]);

    // Mint a position (10 each), token-id → slot 0.
    await tokenA.transfer(await vault.getAddress(), ethers.parseEther("20"));
    await tokenB.transfer(await vault.getAddress(), ethers.parseEther("20"));
    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);
    await vault.createOwnerAutomation([
      actionStep(await mint.getAddress(), encodeMintParams(
        await tokenA.getAddress(), await tokenB.getAddress(), FEE, 0, -1000, 1000, 0,
        ethers.parseEther("10"), ethers.parseEther("10"), 0,
      )),
    ]);
    await vault.executeAutomation(0);
    const tokenId = abiCoder.decode(["uint256"], (await vault.getContext())[0])[0] as bigint;

    return { owner, vault, tokenA, tokenB, npm, collect, tokenId };
  }

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("PancakeSwapV3CollectAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revertedWith("registry=0");
  });

  it("collects accrued fees from a position into the vault", async function () {
    const { vault, tokenA, tokenB, npm, collect, tokenId } = await fixture();
    // Accrue fees (the mock holds the minted principal to pay them out).
    await npm.accrue(tokenId, ethers.parseEther("3"), ethers.parseEther("2"));

    const aBefore = (await tokenA.balanceOf(await vault.getAddress())) as bigint;
    const bBefore = (await tokenB.balanceOf(await vault.getAddress())) as bigint;

    await vault.createOwnerAutomation([
      actionStep(await collect.getAddress(), encodeCollectParams(0)),
    ]);
    await vault.executeAutomation(1);

    expect((await tokenA.balanceOf(await vault.getAddress())) - aBefore).to.equal(ethers.parseEther("3"));
    expect((await tokenB.balanceOf(await vault.getAddress())) - bBefore).to.equal(ethers.parseEther("2"));
  });

  it("is a no-op (no revert) when there is nothing to collect", async function () {
    const { vault, tokenA, collect } = await fixture();
    const before = (await tokenA.balanceOf(await vault.getAddress())) as bigint;
    await vault.createOwnerAutomation([
      actionStep(await collect.getAddress(), encodeCollectParams(0)),
    ]);
    await vault.executeAutomation(1); // does not revert
    expect(await tokenA.balanceOf(await vault.getAddress())).to.equal(before);
  });

  it("reverts when the token-id slot is NO_SLOT (required)", async function () {
    const { vault, collect } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(await collect.getAddress(), encodeCollectParams(NO_SLOT)),
    ]);
    await expect(vault.executeAutomation(1)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });
});
