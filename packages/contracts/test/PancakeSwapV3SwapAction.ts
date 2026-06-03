import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

const { ethers } = await network.connect();

const abiCoder = AbiCoder.defaultAbiCoder();
const enc = (type: string, value: unknown) => abiCoder.encode([type], [value]);
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;
const FEE = 500;

function encodeSwapParams(
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: bigint,
  amountInFromSlot = NO_SLOT,
  amountOutToSlot = NO_SLOT,
  amountOutMinimum: bigint = 0n,
  minOutFromSlot = NO_SLOT,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "uint256", "uint32", "uint32", "uint256", "uint32"],
    [tokenIn, tokenOut, fee, amountIn, amountInFromSlot, amountOutToSlot, amountOutMinimum, minOutFromSlot],
  );
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

// Unit tests for PancakeSwapV3SwapAction against a mock SwapRouter (no fork).
describe("PancakeSwapV3SwapAction", function () {
  async function fixture() {
    const [owner] = await ethers.getSigners();

    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

    const MockToken = await ethers.getContractFactory("MockERC20");
    const tokenIn = await MockToken.deploy("In", "IN", ethers.parseEther("1000000"));
    const tokenOut = await MockToken.deploy("Out", "OUT", ethers.parseEther("1000000"));

    const router = await ethers.deployContract("MockPancakeV3SwapRouter");
    const pcsFactory = await ethers.deployContract("MockPancakeV3Factory");
    const registry = await ethers.deployContract("PancakeSwapV3Registry", [
      await router.getAddress(),
      "0x0000000000000000000000000000000000000001", // NPM placeholder
      await pcsFactory.getAddress(),
    ]);
    const action = await ethers.deployContract("PancakeSwapV3SwapAction", [await registry.getAddress()]);

    // Mock router pays out 1:2 (1 IN → 2 OUT); fund it with OUT liquidity.
    await router.setRate(2, 1);
    await tokenOut.transfer(await router.getAddress(), ethers.parseEther("100000"));
    // Fund the vault with IN.
    await tokenIn.transfer(await vault.getAddress(), ethers.parseEther("100"));

    return { owner, vault, tokenIn, tokenOut, router, action };
  }

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("PancakeSwapV3SwapAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revertedWith("registry=0");
  });

  it("swaps a FIXED amount, resets the router allowance to 0", async function () {
    const { vault, tokenIn, tokenOut, router, action } = await fixture();
    const amountIn = ethers.parseEther("10");

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(await tokenIn.getAddress(), await tokenOut.getAddress(), FEE, amountIn),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await tokenOut.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("20")); // 1:2
    expect(await tokenIn.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("90"));
    expect(await tokenIn.allowance(await vault.getAddress(), await router.getAddress())).to.equal(0n);
  });

  it("executes with amountOutMinimum = 0 (no slippage protection by design)", async function () {
    const { vault, tokenIn, tokenOut, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(await tokenIn.getAddress(), await tokenOut.getAddress(), FEE, ethers.parseEther("5")),
      ),
    ]);
    await vault.executeAutomation(0); // does not revert
    expect(await tokenOut.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("10"));
  });

  it("writes the output amount to a context slot", async function () {
    const { vault, tokenIn, tokenOut, action } = await fixture();
    await vault.setContext([enc("uint256", 0n)]);
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(await tokenIn.getAddress(), await tokenOut.getAddress(), FEE, ethers.parseEther("3"), NO_SLOT, 0),
      ),
    ]);
    await vault.executeAutomation(0);
    const out = abiCoder.decode(["uint256"], (await vault.getContext())[0])[0];
    expect(out).to.equal(ethers.parseEther("6"));
  });

  it("sweeps the full vault balance when amountIn = 0", async function () {
    const { vault, tokenIn, tokenOut, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(await tokenIn.getAddress(), await tokenOut.getAddress(), FEE, 0n),
      ),
    ]);
    await vault.executeAutomation(0);
    expect(await tokenIn.balanceOf(await vault.getAddress())).to.equal(0n);
    expect(await tokenOut.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("200")); // 100 → 200
  });

  it("reads the input amount FROM_SLOT", async function () {
    const { vault, tokenIn, tokenOut, action } = await fixture();
    await vault.setContext([enc("uint256", ethers.parseEther("7"))]);
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(await tokenIn.getAddress(), await tokenOut.getAddress(), FEE, 0n, 0),
      ),
    ]);
    await vault.executeAutomation(0);
    expect(await tokenOut.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("14"));
  });

  it("reverts on a zero tokenIn / tokenOut", async function () {
    const { vault, tokenIn, tokenOut, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(ethers.ZeroAddress, await tokenOut.getAddress(), FEE, 1n),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });
});
