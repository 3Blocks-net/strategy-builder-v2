import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, concat, id } from "ethers";
import {
  curateActions,
  deployCuratedVaultImpl,
} from "./helpers/curated-vault.js";

const { ethers } = await network.connect();

// ─── Shared slippage guard (issue #19, PRD S4 + S5) ──────────────────────────
// Both swapping actions route through one library, so these cases are asserted
// once per action against the SAME rule: a second copy of the rule is exactly
// what this ticket exists to prevent.
//
// Everything here is deterministic (mock pool, mock router): the boundary cases
// — exactly at minOut, one wei below, tolerance floor and ceiling, the spot
// fallback with its halved tolerance — only mean something when the reference
// price and the payout can be set to the wei. The live-pool counterpart is in
// PancakeSwapV3SwapAction.fork.ts.

const abiCoder = AbiCoder.defaultAbiCoder();
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;

const FEE = 500; // 0.05 % pool fee, charged by the router before payout
const FEE_DENOMINATOR = 1_000_000n;
const BPS = 10_000n;

const MIN_TOLERANCE_BPS = 10;
const MAX_TOLERANCE_BPS = 1_000;
const MIN_TWAP_WINDOW = 60;
// Ceiling set from measured live-pool oracle reach; see SlippageGuard.sol.
const MAX_TWAP_WINDOW = 900;

// The mock SwapRouter refuses a payout below `amountOutMinimum` with
// `require(..., "TooLittleReceived")` — an Error(string) revert. Every
// minimum-out case below asserts these exact bytes INSIDE the vault's
// `ActionExecutionFailed(stepIndex, reason)`: the outer error on its own would
// stay green if the step had failed for an unrelated reason, which is the one
// thing these tests must not do.
const ROUTER_MIN_OUT_REJECTION = concat([
  id("Error(string)").slice(0, 10),
  abiCoder.encode(["string"], ["TooLittleReceived"]),
]);

const TOLERANCE_BPS = 100; // 1 %
const TWAP_WINDOW = 300;
const AMOUNT_IN = ethers.parseEther("100");
// 1.0001^6932 ≈ 2 — the tick at which token1 is worth twice token0.
const DOUBLE_PRICE_TICK = 6932;

/** minOut the guard must derive at price 1 (pool tick 0), net of the pool fee. */
function minOutAtParity(amountIn: bigint, toleranceBps: number): bigint {
  const netIn = (amountIn * (FEE_DENOMINATOR - BigInt(FEE))) / FEE_DENOMINATOR;
  return (netIn * (BPS - BigInt(toleranceBps))) / BPS;
}

function encodeSwapParams(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  slippageToleranceBps: number,
  twapWindow: number,
  fee = FEE,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "uint256", "uint32", "uint32", "uint16", "uint32"],
    [tokenIn, tokenOut, fee, amountIn, NO_SLOT, NO_SLOT, slippageToleranceBps, twapWindow],
  );
}

function encodeRangeRatioParams(
  tokenA: string,
  tokenB: string,
  tickDelta: number,
  slippageToleranceBps: number,
  twapWindow: number,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "int24", "uint16", "uint32"],
    [tokenA, tokenB, FEE, tickDelta, slippageToleranceBps, twapWindow],
  );
}

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

describe("SlippageGuard (shared minimum-out rule)", function () {
  /**
   * Vault + SwapAction against a mock pool at tick 0 (price 1) and a mock router
   * whose payout is set per test. `guard` reads the library's events/errors at
   * the vault address — under delegatecall the vault is what emits them.
   */
  async function swapFixture() {
    const [owner] = await ethers.getSigners();

    const { curatedRegistry, vaultImpl } = await deployCuratedVaultImpl(ethers);
    const vaultFactory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await vaultFactory.setVaultImplementation(await vaultImpl.getAddress());
    await vaultFactory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt("StrategyBuilderVault", await vaultFactory.getVault(0));
    const vaultAddr = await vault.getAddress();

    const MockToken = await ethers.getContractFactory("MockERC20");
    const tokenIn = await MockToken.deploy("In", "IN", ethers.parseEther("1000000"));
    const tokenOut = await MockToken.deploy("Out", "OUT", ethers.parseEther("1000000"));
    const inAddr = await tokenIn.getAddress();
    const outAddr = await tokenOut.getAddress();
    const inIsToken0 = inAddr.toLowerCase() < outAddr.toLowerCase();
    const [t0, t1] = inIsToken0 ? [inAddr, outAddr] : [outAddr, inAddr];

    const pool = await ethers.deployContract("MockPancakeV3Pool", [t0, t1, 10, 0]);
    const poolAddr = await pool.getAddress();
    const router = await ethers.deployContract("MockPancakeV3SwapRouter");
    const pcsFactory = await ethers.deployContract("MockPancakeV3Factory");
    await pcsFactory.setPool(t0, t1, FEE, poolAddr);

    const registry = await ethers.deployContract("PancakeSwapV3Registry", [
      await router.getAddress(),
      "0x0000000000000000000000000000000000000001",
      await pcsFactory.getAddress(),
    ]);
    const action = await ethers.deployContract("PancakeSwapV3SwapAction", [await registry.getAddress()]);
    // The vault refuses uncurated targets in standard mode.
    await curateActions(curatedRegistry, action);

    await tokenOut.transfer(await router.getAddress(), ethers.parseEther("500000"));
    await tokenIn.transfer(vaultAddr, AMOUNT_IN);

    const guard = await ethers.getContractAt("SlippageGuard", vaultAddr);

    /** Queue one swap step and run it. */
    const runSwap = async (toleranceBps = TOLERANCE_BPS, twapWindow = TWAP_WINDOW, fee = FEE) => {
      await vault.createOwnerAutomation([
        actionStep(
          await action.getAddress(),
          encodeSwapParams(inAddr, outAddr, AMOUNT_IN, toleranceBps, twapWindow, fee),
        ),
      ]);
      const automationId = (await vault.automationCount()) - 1n;
      return vault.executeAutomation(automationId);
    };

    /** Make the router pay exactly `amount` for AMOUNT_IN. */
    const payExactly = (amount: bigint) => router.setRate(amount, AMOUNT_IN);

    return { vault, vaultAddr, tokenIn, tokenOut, inIsToken0, pool, poolAddr, router, action, guard, runSwap, payExactly, curatedRegistry };
  }

  /** SwapToRangeRatio calls the same guard; it is exercised directly (no vault). */
  async function rangeRatioFixture() {
    const MockToken = await ethers.getContractFactory("MockERC20");
    let token0 = await MockToken.deploy("T0", "T0", ethers.parseEther("1000000"));
    let token1 = await MockToken.deploy("T1", "T1", ethers.parseEther("1000000"));
    if ((await token0.getAddress()).toLowerCase() > (await token1.getAddress()).toLowerCase()) {
      [token0, token1] = [token1, token0];
    }
    const t0 = await token0.getAddress();
    const t1 = await token1.getAddress();

    const pool = await ethers.deployContract("MockPancakeV3Pool", [t0, t1, 10, 0]);
    const pcsFactory = await ethers.deployContract("MockPancakeV3Factory");
    await pcsFactory.setPool(t0, t1, FEE, await pool.getAddress());
    const router = await ethers.deployContract("MockPancakeV3SwapRouter");
    await router.setRate(1, 1);
    await token0.transfer(await router.getAddress(), ethers.parseEther("100000"));
    await token1.transfer(await router.getAddress(), ethers.parseEther("100000"));

    const registry = await ethers.deployContract("PancakeSwapV3Registry", [
      await router.getAddress(),
      "0x0000000000000000000000000000000000000001",
      await pcsFactory.getAddress(),
    ]);
    const action = await ethers.deployContract("PancakeSwapV3SwapToRangeRatioAction", [
      await registry.getAddress(),
    ]);
    const actionAddr = await action.getAddress();
    const guard = await ethers.getContractAt("SlippageGuard", actionAddr);

    return { token0, token1, t0, t1, pool, router, action, actionAddr, guard };
  }

  describe("parameter bounds (rejected on-chain, both actions)", function () {
    it("rejects a tolerance below the floor", async function () {
      const { vault, guard, runSwap } = await swapFixture();
      await expect(runSwap(MIN_TOLERANCE_BPS - 1))
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(
          0,
          guard.interface.encodeErrorResult("ToleranceOutOfRange", [MIN_TOLERANCE_BPS - 1]),
        );
    });

    it("rejects a tolerance above the ceiling", async function () {
      const { vault, guard, runSwap } = await swapFixture();
      await expect(runSwap(MAX_TOLERANCE_BPS + 1))
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(
          0,
          guard.interface.encodeErrorResult("ToleranceOutOfRange", [MAX_TOLERANCE_BPS + 1]),
        );
    });

    it("rejects a zero tolerance — an unprotected swap is not expressible", async function () {
      const { vault, guard, runSwap } = await swapFixture();
      await expect(runSwap(0))
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(0, guard.interface.encodeErrorResult("ToleranceOutOfRange", [0]));
    });

    it("rejects a TWAP window outside the bounds", async function () {
      const { vault, guard, runSwap } = await swapFixture();
      await expect(runSwap(TOLERANCE_BPS, MIN_TWAP_WINDOW - 1))
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(
          0,
          guard.interface.encodeErrorResult("TwapWindowOutOfRange", [MIN_TWAP_WINDOW - 1]),
        );
      await expect(runSwap(TOLERANCE_BPS, MAX_TWAP_WINDOW + 1))
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(
          0,
          guard.interface.encodeErrorResult("TwapWindowOutOfRange", [MAX_TWAP_WINDOW + 1]),
        );
    });

    it("rejects the same bounds in SwapToRangeRatio, before any swap is sized", async function () {
      const { token0, t0, t1, action, actionAddr, guard } = await rangeRatioFixture();
      await token0.transfer(actionAddr, ethers.parseEther("100"));

      await expect(
        action.execute(encodeRangeRatioParams(t0, t1, 1000, MIN_TOLERANCE_BPS - 1, TWAP_WINDOW), []),
      )
        .to.be.revertedWithCustomError(guard, "ToleranceOutOfRange")
        .withArgs(MIN_TOLERANCE_BPS - 1);

      await expect(
        action.execute(encodeRangeRatioParams(t0, t1, 1000, TOLERANCE_BPS, MAX_TWAP_WINDOW + 1), []),
      )
        .to.be.revertedWithCustomError(guard, "TwapWindowOutOfRange")
        .withArgs(MAX_TWAP_WINDOW + 1);
    });

    it("rejects a bad tolerance even when the holding is already balanced (no swap sized)", async function () {
      const { token0, token1, t0, t1, action, actionAddr, guard } = await rangeRatioFixture();
      await token0.transfer(actionAddr, ethers.parseEther("50"));
      await token1.transfer(actionAddr, ethers.parseEther("50"));

      await expect(
        action.execute(encodeRangeRatioParams(t0, t1, 1000, MAX_TOLERANCE_BPS + 1, TWAP_WINDOW), []),
      ).to.be.revertedWithCustomError(guard, "ToleranceOutOfRange");
    });
  });

  describe("at the minimum-out boundary", function () {
    it("passes when the payout is exactly minOut", async function () {
      const { tokenOut, vaultAddr, runSwap, payExactly } = await swapFixture();
      const minOut = minOutAtParity(AMOUNT_IN, TOLERANCE_BPS);
      await payExactly(minOut);

      await runSwap();
      expect(await tokenOut.balanceOf(vaultAddr)).to.equal(minOut);
    });

    it("reverts one wei below minOut", async function () {
      const { vault, tokenOut, vaultAddr, runSwap, payExactly } = await swapFixture();
      await payExactly(minOutAtParity(AMOUNT_IN, TOLERANCE_BPS) - 1n);

      await expect(runSwap())
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(0, ROUTER_MIN_OUT_REJECTION); // refused for the bound, not by accident
      expect(await tokenOut.balanceOf(vaultAddr)).to.equal(0n);
    });

    it("holds at the tolerance floor: exactly minOut passes, one wei less reverts", async function () {
      const { vault, tokenOut, vaultAddr, runSwap, payExactly } = await swapFixture();
      const minOut = minOutAtParity(AMOUNT_IN, MIN_TOLERANCE_BPS);

      await payExactly(minOut - 1n);
      await expect(runSwap(MIN_TOLERANCE_BPS))
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(0, ROUTER_MIN_OUT_REJECTION);

      await payExactly(minOut);
      await runSwap(MIN_TOLERANCE_BPS);
      expect(await tokenOut.balanceOf(vaultAddr)).to.equal(minOut);
    });

    it("holds at the tolerance ceiling: exactly minOut passes, one wei less reverts", async function () {
      const { vault, tokenOut, vaultAddr, runSwap, payExactly } = await swapFixture();
      const minOut = minOutAtParity(AMOUNT_IN, MAX_TOLERANCE_BPS);

      await payExactly(minOut - 1n);
      await expect(runSwap(MAX_TOLERANCE_BPS))
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(0, ROUTER_MIN_OUT_REJECTION);

      await payExactly(minOut);
      await runSwap(MAX_TOLERANCE_BPS);
      expect(await tokenOut.balanceOf(vaultAddr)).to.equal(minOut);
    });

    it("reports the enforced bound in the event", async function () {
      const { poolAddr, tokenIn, tokenOut, runSwap, payExactly, guard } = await swapFixture();
      const minOut = minOutAtParity(AMOUNT_IN, TOLERANCE_BPS);
      await payExactly(minOut);

      await expect(runSwap())
        .to.emit(guard, "SwapMinOutEnforced")
        .withArgs(
          poolAddr,
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          AMOUNT_IN,
          minOut,
          TOLERANCE_BPS,
          false, // TWAP reference, not the spot fallback
        );
    });

    it("catches an output token that under-delivers behind the router's own check", async function () {
      const { vault, guard, router, runSwap, payExactly } = await swapFixture();
      const minOut = minOutAtParity(AMOUNT_IN, TOLERANCE_BPS);
      await payExactly(minOut);
      // Router reports minOut and passes its own check, but transfers 1 % less.
      await router.setPayoutBps(9_900);

      await expect(runSwap())
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(
          0,
          guard.interface.encodeErrorResult("InsufficientOutput", [
            (minOut * 9_900n) / BPS,
            minOut,
          ]),
        );
    });
  });

  describe("reference price", function () {
    it("prices against the TWAP, not the spot tick", async function () {
      const { vault, pool, inIsToken0, runSwap, payExactly } = await swapFixture();
      // Spot stays at tick 0 (price 1); the average says the output token is
      // worth twice as much. A payout priced at spot must be rejected.
      await pool.setTwapTick(inIsToken0 ? DOUBLE_PRICE_TICK : -DOUBLE_PRICE_TICK);
      await payExactly(minOutAtParity(AMOUNT_IN, TOLERANCE_BPS));

      // Refused against the TWAP-derived bound — not by some other failure.
      await expect(runSwap())
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(0, ROUTER_MIN_OUT_REJECTION);
    });

    it("falls back to the spot price when the oracle cannot serve the window", async function () {
      const { pool, tokenOut, vaultAddr, inIsToken0, runSwap, payExactly, guard, poolAddr, tokenIn } =
        await swapFixture();
      // Same doubled average as above, but the oracle is unavailable: the guard
      // must fall back to the spot tick (price 1), where the payout is fine.
      await pool.setTwapTick(inIsToken0 ? DOUBLE_PRICE_TICK : -DOUBLE_PRICE_TICK);
      await pool.setObserveReverts(true);
      const minOut = minOutAtParity(AMOUNT_IN, TOLERANCE_BPS / 2);
      await payExactly(minOut);

      await expect(runSwap())
        .to.emit(guard, "SwapMinOutEnforced")
        .withArgs(
          poolAddr,
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          AMOUNT_IN,
          minOut,
          TOLERANCE_BPS / 2, // halved
          true, // fallback is visible in the event
        );
      expect(await tokenOut.balanceOf(vaultAddr)).to.equal(minOut);
    });

    it("halves the tolerance in the fallback — the full tolerance is no longer enough", async function () {
      const { vault, pool, runSwap, payExactly } = await swapFixture();
      await pool.setObserveReverts(true);
      // Exactly what the UNhalved tolerance would have allowed.
      await payExactly(minOutAtParity(AMOUNT_IN, TOLERANCE_BPS));

      await expect(runSwap())
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(0, ROUTER_MIN_OUT_REJECTION);
    });

    it("reverts when no pool prices the pair", async function () {
      const { vault, guard, runSwap } = await swapFixture();
      await expect(runSwap(TOLERANCE_BPS, TWAP_WINDOW, 2500))
        .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
        .withArgs(0, guard.interface.encodeErrorResult("PoolNotFound", []));
    });
  });

  describe("SwapToRangeRatio uses the same rule", function () {
    it("enforces a minimum out on its sizing swap", async function () {
      const { token0, t0, t1, router, action, actionAddr } = await rangeRatioFixture();
      await token0.transfer(actionAddr, ethers.parseEther("100"));
      // Pays a tenth of the pool price — below any allowed tolerance.
      await router.setRate(1, 10);

      await expect(
        action.execute(encodeRangeRatioParams(t0, t1, 1000, TOLERANCE_BPS, TWAP_WINDOW), []),
      ).to.be.revertedWith("TooLittleReceived");
      // Nothing moved: the whole step reverted.
      expect(await token0.balanceOf(actionAddr)).to.equal(ethers.parseEther("100"));
    });

    it("emits the shared guard event with the same TWAP reference", async function () {
      const { token0, t0, t1, pool, action, actionAddr, guard } = await rangeRatioFixture();
      await token0.transfer(actionAddr, ethers.parseEther("100"));

      await expect(
        action.execute(encodeRangeRatioParams(t0, t1, 1000, TOLERANCE_BPS, TWAP_WINDOW), []),
      )
        .to.emit(guard, "SwapMinOutEnforced")
        .withArgs(
          await pool.getAddress(),
          t0,
          t1,
          (v: bigint) => v > 0n,
          (v: bigint) => v > 0n,
          TOLERANCE_BPS,
          false,
        );
    });

    it("falls back to spot with a halved tolerance too", async function () {
      const { token0, t0, t1, pool, action, actionAddr, guard } = await rangeRatioFixture();
      await token0.transfer(actionAddr, ethers.parseEther("100"));
      await pool.setObserveReverts(true);

      await expect(
        action.execute(encodeRangeRatioParams(t0, t1, 1000, TOLERANCE_BPS, TWAP_WINDOW), []),
      )
        .to.emit(guard, "SwapMinOutEnforced")
        .withArgs(
          await pool.getAddress(),
          t0,
          t1,
          (v: bigint) => v > 0n,
          (v: bigint) => v > 0n,
          TOLERANCE_BPS / 2,
          true,
        );
    });
  });
});
