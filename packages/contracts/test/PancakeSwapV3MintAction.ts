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
  tokenA: string,
  tokenB: string,
  fee: number,
  rangeMode: number,
  tickLower: number,
  tickUpper: number,
  tickDelta: number,
  amountADesired: bigint,
  amountBDesired: bigint,
  tokenIdToSlot: number,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "uint8", "int24", "int24", "int24", "uint256", "uint256", "uint32"],
    [tokenA, tokenB, fee, rangeMode, tickLower, tickUpper, tickDelta, amountADesired, amountBDesired, tokenIdToSlot],
  );
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

describe("PancakeSwapV3MintAction", function () {
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
    // Ensure tokenA < tokenB so the test reasoning about token0/token1 is stable.
    if ((await tokenA.getAddress()).toLowerCase() > (await tokenB.getAddress()).toLowerCase()) {
      [tokenA, tokenB] = [tokenB, tokenA];
    }

    const npm = await ethers.deployContract("MockNonfungiblePositionManager");
    const pcsFactory = await ethers.deployContract("MockPancakeV3Factory");
    const registry = await ethers.deployContract("PancakeSwapV3Registry", [
      "0x0000000000000000000000000000000000000001", // swapRouter placeholder
      await npm.getAddress(),
      await pcsFactory.getAddress(),
    ]);
    const action = await ethers.deployContract("PancakeSwapV3MintAction", [await registry.getAddress()]);

    // Fund the vault with both tokens.
    await tokenA.transfer(await vault.getAddress(), ethers.parseEther("100"));
    await tokenB.transfer(await vault.getAddress(), ethers.parseEther("100"));

    return { owner, vault, tokenA, tokenB, npm, pcsFactory, registry, action };
  }

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("PancakeSwapV3MintAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revertedWith("registry=0");
  });

  it("mints an explicit-range position; vault owns the NFT; token-id → slot; allowances reset", async function () {
    const { vault, tokenA, tokenB, npm, action } = await fixture();
    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeMintParams(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          FEE,
          0, // explicit
          -1000,
          2000,
          0,
          ethers.parseEther("10"),
          ethers.parseEther("20"),
          0,
        ),
      ),
    ]);
    await vault.executeAutomation(0);

    // token-id written to slot 0 (first minted id = 1).
    const tokenId = abiCoder.decode(["uint256"], (await vault.getContext())[0])[0] as bigint;
    expect(tokenId).to.equal(1n);

    // Vault owns the NFT (onERC721Received accepted the _safeMint).
    expect(await npm.ownerOf(1)).to.equal(await vault.getAddress());

    // Position stored with the explicit ticks (tokenA < tokenB ⇒ token0 = tokenA).
    const pos = await npm.positionOf(1);
    expect(pos.token0).to.equal(await tokenA.getAddress());
    expect(pos.tickLower).to.equal(-1000n);
    expect(pos.tickUpper).to.equal(2000n);

    // Approval hygiene.
    expect(await tokenA.allowance(await vault.getAddress(), await npm.getAddress())).to.equal(0n);
    expect(await tokenB.allowance(await vault.getAddress(), await npm.getAddress())).to.equal(0n);
  });

  it("mints a preset-width position centered on the live tick, rounded outward", async function () {
    const { vault, tokenA, tokenB, npm, pcsFactory, action } = await fixture();
    // Pool with tickSpacing 10, current tick 105.
    const pool = await ethers.deployContract("MockPancakeV3Pool", [
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      10,
      105,
    ]);
    await pcsFactory.setPool(await tokenA.getAddress(), await tokenB.getAddress(), FEE, await pool.getAddress());

    await vault.setContext([abiCoder.encode(["uint256"], [0n])]);
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeMintParams(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          FEE,
          1, // preset
          0,
          0,
          50, // tickDelta
          ethers.parseEther("5"),
          ethers.parseEther("5"),
          0,
        ),
      ),
    ]);
    await vault.executeAutomation(0);

    // lower = roundDown(105-50=55, 10) = 50 ; upper = roundUp(105+50=155, 10) = 160.
    const pos = await npm.positionOf(1);
    expect(pos.tickLower).to.equal(50n);
    expect(pos.tickUpper).to.equal(160n);
  });

  it("uses the full vault balance when a desired amount is 0", async function () {
    const { vault, tokenA, tokenB, npm, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeMintParams(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          FEE,
          0,
          -100,
          100,
          0,
          0n, // full balance A
          0n, // full balance B
          NO_SLOT,
        ),
      ),
    ]);
    await vault.executeAutomation(0);
    // Both balances swept into the NPM.
    expect(await tokenA.balanceOf(await vault.getAddress())).to.equal(0n);
    expect(await tokenB.balanceOf(await vault.getAddress())).to.equal(0n);
    expect(await tokenA.balanceOf(await npm.getAddress())).to.equal(ethers.parseEther("100"));
  });

  it("reverts on an explicit range with tickLower >= tickUpper", async function () {
    const { vault, tokenA, tokenB, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeMintParams(await tokenA.getAddress(), await tokenB.getAddress(), FEE, 0, 100, 100, 0, 1n, 1n, NO_SLOT),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });

  it("reverts when the same token is used twice", async function () {
    const { vault, tokenA, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeMintParams(await tokenA.getAddress(), await tokenA.getAddress(), FEE, 0, -1, 1, 0, 1n, 1n, NO_SLOT),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });
});
