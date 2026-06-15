import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// Canonical Uniswap/PancakeSwap V3 TickMath anchors — IDENTICAL to the values the
// backend `lp-math.spec.ts` pins its TS port to. Asserting the Solidity library
// against the same anchors guarantees the on-chain and off-chain tick math agree
// (the strategy's sizing-preview vs execution correctness depends on this).
const Q96 = 2n ** 96n;
const MIN_TICK = -887272;
const MAX_TICK = 887272;

describe("TickMath (Solidity port — cross-layer canonical anchors)", function () {
  async function harness() {
    return ethers.deployContract("TickMathHarness");
  }

  it("tick 0 → exactly 2^96", async function () {
    const h = await harness();
    expect(await h.getSqrtRatioAtTick(0)).to.equal(Q96);
    expect(await h.getSqrtRatioAtTick(0)).to.equal(79228162514264337593543950336n);
  });

  it("MIN_TICK → MIN_SQRT_RATIO (4295128739)", async function () {
    const h = await harness();
    expect(await h.getSqrtRatioAtTick(MIN_TICK)).to.equal(4295128739n);
  });

  it("MAX_TICK → MAX_SQRT_RATIO", async function () {
    const h = await harness();
    expect(await h.getSqrtRatioAtTick(MAX_TICK)).to.equal(
      1461446703485210103287273052203988822378723970342n,
    );
  });

  it("is monotonic around 0", async function () {
    const h = await harness();
    const at0 = await h.getSqrtRatioAtTick(0);
    expect((await h.getSqrtRatioAtTick(60)) > at0).to.equal(true);
    expect((await h.getSqrtRatioAtTick(-60)) < at0).to.equal(true);
  });

  it("rounds negative ticks toward −∞ (matches the TS port)", async function () {
    const h = await harness();
    // −1000 → matches the backend TS port exactly (same algorithm/constants)
    expect(await h.getSqrtRatioAtTick(-1000)).to.equal(75364347830767020784054125655n);
  });

  it("reverts out-of-range ticks", async function () {
    const h = await harness();
    await expect(h.getSqrtRatioAtTick(MAX_TICK + 1)).to.be.revert(ethers);
  });
});
