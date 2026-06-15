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

function encodeDecreaseParams(tokenIdFromSlot: number, percent: number): string {
  return abiCoder.encode(["uint32", "uint16"], [tokenIdFromSlot, percent]);
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

describe("PancakeSwapV3DecreaseLiquidityAction", function () {
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
    const decrease = await ethers.deployContract("PancakeSwapV3DecreaseLiquidityAction", [await registry.getAddress()]);

    // Fund + mint a position (10 each), token-id → slot 0.
    await tokenA.transfer(await vault.getAddress(), ethers.parseEther("50"));
    await tokenB.transfer(await vault.getAddress(), ethers.parseEther("50"));
    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);
    await vault.createOwnerAutomation([
      actionStep(await mint.getAddress(), encodeMintParams(
        await tokenA.getAddress(), await tokenB.getAddress(), FEE, 0, -1000, 1000, 0,
        ethers.parseEther("10"), ethers.parseEther("10"), 0,
      )),
    ]);
    await vault.executeAutomation(0);
    const tokenId = abiCoder.decode(["uint256"], (await vault.getContext())[0])[0] as bigint;

    return { owner, vault, tokenA, tokenB, npm, decrease, tokenId };
  }

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("PancakeSwapV3DecreaseLiquidityAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revertedWith("registry=0");
  });

  it("100% removes all liquidity AND the freed tokens arrive in the vault (collect ran)", async function () {
    const { vault, tokenA, tokenB, npm, decrease, tokenId } = await fixture();
    // After mint, the vault holds 40 each; 10 each is locked in the position.
    expect(await tokenA.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("40"));

    await vault.createOwnerAutomation([
      actionStep(await decrease.getAddress(), encodeDecreaseParams(0, 100)),
    ]);
    await vault.executeAutomation(1);

    // Liquidity fully removed AND principal delivered back to the vault.
    expect((await npm.positionOf(tokenId)).liquidity).to.equal(0n);
    expect(await tokenA.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("50"));
    expect(await tokenB.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("50"));
    // The freed tokens left the NPM (collect actually pulled them).
    expect(await tokenA.balanceOf(await npm.getAddress())).to.equal(0n);
  });

  it("a partial percentage removes the proportional amount", async function () {
    const { vault, tokenA, npm, decrease, tokenId } = await fixture();
    const liqBefore = (await npm.positionOf(tokenId)).liquidity as bigint;

    await vault.createOwnerAutomation([
      actionStep(await decrease.getAddress(), encodeDecreaseParams(0, 50)),
    ]);
    await vault.executeAutomation(1);

    // Half the liquidity removed; ~5 of tokenA returned (40 → 45).
    expect((await npm.positionOf(tokenId)).liquidity).to.equal(liqBefore / 2n);
    expect(await tokenA.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("45"));
  });

  it("reverts on an invalid percentage (0 or > 100)", async function () {
    const { vault, decrease } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(await decrease.getAddress(), encodeDecreaseParams(0, 0)),
    ]);
    await expect(vault.executeAutomation(1)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");

    await vault.createOwnerAutomation([
      actionStep(await decrease.getAddress(), encodeDecreaseParams(0, 101)),
    ]);
    await expect(vault.executeAutomation(2)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });

  it("reverts when the token-id slot is NO_SLOT (required)", async function () {
    const { vault, decrease } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(await decrease.getAddress(), encodeDecreaseParams(NO_SLOT, 100)),
    ]);
    await expect(vault.executeAutomation(1)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });
});
