import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder } from "ethers";

const { ethers } = await network.connect();
const abiCoder = AbiCoder.defaultAbiCoder();

const FEE = 500;
const SPACING = 10;
const TICK_LOWER = -1000;
const TICK_UPPER = 1000;
const W = 1800; // 30-minute TWAP window
const COOLDOWN = 3 * 24 * 3600; // 3 days

// Params: (tokenIdSlot, twapWindow, cooldown, lastRebalanceSlot)
function encodeParams(tokenIdSlot: number, w: number, cooldown: number, lastSlot: number): string {
  return abiCoder.encode(["uint32", "uint32", "uint256", "uint32"], [tokenIdSlot, w, cooldown, lastSlot]);
}

describe("WickWaitRebalanceCondition", function () {
  async function fixture() {
    const [owner] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    let tokenA = await MockToken.deploy("A", "A", 0n);
    let tokenB = await MockToken.deploy("B", "B", 0n);
    if ((await tokenA.getAddress()).toLowerCase() > (await tokenB.getAddress()).toLowerCase()) {
      [tokenA, tokenB] = [tokenB, tokenA];
    }
    const t0 = await tokenA.getAddress();
    const t1 = await tokenB.getAddress();

    const npm = await ethers.deployContract("MockNonfungiblePositionManager");
    const pcsFactory = await ethers.deployContract("MockPancakeV3Factory");
    const pool = await ethers.deployContract("MockPancakeV3Pool", [t0, t1, SPACING, 0]);
    await pcsFactory.setPool(t0, t1, FEE, await pool.getAddress());

    const registry = await ethers.deployContract("PancakeSwapV3Registry", [
      "0x0000000000000000000000000000000000000001", // swapRouter (unused here)
      await npm.getAddress(),
      await pcsFactory.getAddress(),
    ]);

    // Record a position (zero amounts ⇒ no transfers); ticks are what matter.
    await npm.mint({
      token0: t0, token1: t1, fee: FEE,
      tickLower: TICK_LOWER, tickUpper: TICK_UPPER,
      amount0Desired: 0n, amount1Desired: 0n, amount0Min: 0n, amount1Min: 0n,
      recipient: owner.address, deadline: 2n ** 32n,
    });
    const tokenId = 1n;

    const condition = await ethers.deployContract("WickWaitRebalanceCondition", [await registry.getAddress()]);

    // ctx: slot 0 = tokenId, slot 1 = lastRebalance timestamp.
    const ctx = (lastRebalance: bigint) => [
      abiCoder.encode(["uint256"], [tokenId]),
      abiCoder.encode(["uint256"], [lastRebalance]),
    ];

    return { owner, pool, condition, ctx };
  }

  it("does not fire while the TWAP tick is inside the range", async function () {
    const { pool, condition, ctx } = await fixture();
    await pool.setTwapTick(0); // inside [-1000, 1000)
    expect(await condition.check(encodeParams(0, W, COOLDOWN, 1), ctx(0n))).to.equal(false);
  });

  it("fires when the TWAP tick is below the range (cooldown elapsed)", async function () {
    const { pool, condition, ctx } = await fixture();
    await pool.setTwapTick(-2000);
    expect(await condition.check(encodeParams(0, W, COOLDOWN, 1), ctx(0n))).to.equal(true);
  });

  it("fires when the TWAP tick is at/above the upper bound", async function () {
    const { pool, condition, ctx } = await fixture();
    await pool.setTwapTick(TICK_UPPER); // upper is exclusive
    expect(await condition.check(encodeParams(0, W, COOLDOWN, 1), ctx(0n))).to.equal(true);
  });

  it("ignores a wick: spot tick out of range but TWAP still inside ⇒ no fire", async function () {
    const { pool, condition, ctx } = await fixture();
    await pool.setTwapTick(0); // mean still in range
    // (the spot/current tick could be far outside; the condition only reads the TWAP)
    expect(await condition.check(encodeParams(0, W, COOLDOWN, 1), ctx(0n))).to.equal(false);
  });

  it("blocks a re-fire until the cooldown has elapsed", async function () {
    const { pool, condition, ctx } = await fixture();
    await pool.setTwapTick(2000); // breach
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    // last rebalance just happened ⇒ cooldown not elapsed ⇒ no fire
    expect(await condition.check(encodeParams(0, W, COOLDOWN, 1), ctx(now))).to.equal(false);
    // …advance past the cooldown ⇒ fires
    await ethers.provider.send("evm_increaseTime", [COOLDOWN + 1]);
    await ethers.provider.send("evm_mine", []);
    expect(await condition.check(encodeParams(0, W, COOLDOWN, 1), ctx(now))).to.equal(true);
  });

  it("first run (last-rebalance slot = 0) is not cooldown-blocked", async function () {
    const { pool, condition, ctx } = await fixture();
    await pool.setTwapTick(2000);
    expect(await condition.check(encodeParams(0, W, COOLDOWN, 1), ctx(0n))).to.equal(true);
  });

  it("propagates the observe revert on insufficient cardinality (no silent false)", async function () {
    const { pool, condition, ctx } = await fixture();
    await pool.setTwapTick(2000);
    await pool.setObserveReverts(true);
    await expect(condition.check(encodeParams(0, W, COOLDOWN, 1), ctx(0n))).to.be.revert(ethers);
  });

  it("reverts on a zero TWAP window", async function () {
    const { condition, ctx } = await fixture();
    await expect(condition.check(encodeParams(0, 0, COOLDOWN, 1), ctx(0n))).to.be.revertedWithCustomError(
      condition, "ZeroWindow",
    );
  });

  it("afterExecution records the current block timestamp into the last-rebalance slot", async function () {
    const { condition, ctx } = await fixture();
    const [slots, values] = await condition.afterExecution.staticCall(encodeParams(0, W, COOLDOWN, 1), ctx(0n));
    expect(slots[0]).to.equal(1n);
    const written = abiCoder.decode(["uint256"], values[0])[0] as bigint;
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    expect(written).to.be.closeTo(now, 5n);
  });
});
