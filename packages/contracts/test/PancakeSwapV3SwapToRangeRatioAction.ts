import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder } from "ethers";

const { ethers } = await network.connect();
const abiCoder = AbiCoder.defaultAbiCoder();

const FEE = 500;
const SPACING = 10;
const TICK_DELTA = 1000; // symmetric range ⇒ target ≈ 50/50 by value
const E = (n: string) => ethers.parseEther(n);

function encodeParams(tokenA: string, tokenB: string, tickDelta: number): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "int24", "uint256"],
    [tokenA, tokenB, FEE, tickDelta, 0n],
  );
}

describe("PancakeSwapV3SwapToRangeRatioAction", function () {
  async function fixture() {
    const MockToken = await ethers.getContractFactory("MockERC20");
    let token0 = await MockToken.deploy("T0", "T0", E("1000000"));
    let token1 = await MockToken.deploy("T1", "T1", E("1000000"));
    if ((await token0.getAddress()).toLowerCase() > (await token1.getAddress()).toLowerCase()) {
      [token0, token1] = [token1, token0];
    }
    const t0 = await token0.getAddress();
    const t1 = await token1.getAddress();

    // Pool at tick 0 (price = 1) ⇒ symmetric range target is 50/50 by value.
    const pool = await ethers.deployContract("MockPancakeV3Pool", [t0, t1, SPACING, 0]);
    const pcsFactory = await ethers.deployContract("MockPancakeV3Factory");
    await pcsFactory.setPool(t0, t1, FEE, await pool.getAddress());

    const router = await ethers.deployContract("MockPancakeV3SwapRouter");
    await router.setRate(1, 1); // 1:1, consistent with price 1 at tick 0
    // Fund the router so it can pay out either token.
    await token0.transfer(await router.getAddress(), E("100000"));
    await token1.transfer(await router.getAddress(), E("100000"));

    const registry = await ethers.deployContract("PancakeSwapV3Registry", [
      await router.getAddress(),
      "0x0000000000000000000000000000000000000001", // positionManager (unused here)
      await pcsFactory.getAddress(),
    ]);
    const action = await ethers.deployContract("PancakeSwapV3SwapToRangeRatioAction", [
      await registry.getAddress(),
    ]);
    const actionAddr = await action.getAddress();

    const bal = async () => ({
      b0: await token0.balanceOf(actionAddr),
      b1: await token1.balanceOf(actionAddr),
    });

    return { token0, token1, t0, t1, action, actionAddr, bal };
  }

  it("entry from a single token0 → balances to ~50/50", async function () {
    const { token0, t0, t1, action, actionAddr, bal } = await fixture();
    await token0.transfer(actionAddr, E("100"));
    await action.execute(encodeParams(t0, t1, TICK_DELTA), []);
    const { b0, b1 } = await bal();
    expect(b0).to.be.closeTo(E("50"), E("1"));
    expect(b1).to.be.closeTo(E("50"), E("1"));
  });

  it("entry from a single token1 → balances to ~50/50", async function () {
    const { token1, t0, t1, action, actionAddr, bal } = await fixture();
    await token1.transfer(actionAddr, E("100"));
    await action.execute(encodeParams(t0, t1, TICK_DELTA), []);
    const { b0, b1 } = await bal();
    expect(b0).to.be.closeTo(E("50"), E("1"));
    expect(b1).to.be.closeTo(E("50"), E("1"));
  });

  it("rebalances an imbalanced two-token holding toward ~50/50", async function () {
    const { token0, token1, t0, t1, action, actionAddr, bal } = await fixture();
    await token0.transfer(actionAddr, E("80"));
    await token1.transfer(actionAddr, E("20"));
    await action.execute(encodeParams(t0, t1, TICK_DELTA), []);
    const { b0, b1 } = await bal();
    expect(b0).to.be.closeTo(E("50"), E("1"));
    expect(b1).to.be.closeTo(E("50"), E("1"));
  });

  it("is a no-op when already balanced", async function () {
    const { token0, token1, t0, t1, action, actionAddr, bal } = await fixture();
    await token0.transfer(actionAddr, E("50"));
    await token1.transfer(actionAddr, E("50"));
    await action.execute(encodeParams(t0, t1, TICK_DELTA), []);
    const { b0, b1 } = await bal();
    expect(b0).to.equal(E("50"));
    expect(b1).to.equal(E("50"));
  });

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("PancakeSwapV3SwapToRangeRatioAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revert(ethers);
  });
});
