import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, concat, id } from "ethers";

const { ethers } = await network.connect();

const abiCoder = AbiCoder.defaultAbiCoder();
const enc = (type: string, value: unknown) => abiCoder.encode([type], [value]);
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;
const FEE = 500;
// Slippage defaults for the amount-routing tests below. The reference pool sits
// at tick 0 (price 1) while the mock router pays 1:2, so the guard's minimum-out
// is always cleared — these tests are about amount routing, not the guard. The
// guard's own edge cases live in SlippageGuard.ts.
const TOLERANCE_BPS = 100;
const TWAP_WINDOW = 300;

// The mock SwapRouter refuses a payout below `amountOutMinimum` with
// `require(..., "TooLittleReceived")` — an Error(string) revert. The vault
// carries that reason inside `ActionExecutionFailed(stepIndex, reason)`, so a
// test can name the real cause instead of settling for the generic wrapper
// (which would stay green if the step had failed for any other reason).
const ROUTER_MIN_OUT_REJECTION = concat([
  id("Error(string)").slice(0, 10),
  abiCoder.encode(["string"], ["TooLittleReceived"]),
]);

function encodeSwapParams(
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: bigint,
  amountInFromSlot = NO_SLOT,
  amountOutToSlot = NO_SLOT,
  slippageToleranceBps = TOLERANCE_BPS,
  twapWindow = TWAP_WINDOW,
): string {
  return abiCoder.encode(
    ["address", "address", "uint24", "uint256", "uint32", "uint32", "uint16", "uint32"],
    [tokenIn, tokenOut, fee, amountIn, amountInFromSlot, amountOutToSlot, slippageToleranceBps, twapWindow],
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
    const inAddr = await tokenIn.getAddress();
    const outAddr = await tokenOut.getAddress();
    const [t0, t1] = inAddr.toLowerCase() < outAddr.toLowerCase() ? [inAddr, outAddr] : [outAddr, inAddr];

    // Reference pool at tick 0 ⇒ price 1 in both directions.
    const pool = await ethers.deployContract("MockPancakeV3Pool", [t0, t1, 10, 0]);
    const router = await ethers.deployContract("MockPancakeV3SwapRouter");
    const pcsFactory = await ethers.deployContract("MockPancakeV3Factory");
    await pcsFactory.setPool(t0, t1, FEE, await pool.getAddress());
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

    return { owner, vault, tokenIn, tokenOut, pool, router, action };
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

  it("enforces a minimum output derived from the pool price", async function () {
    const { vault, tokenIn, tokenOut, router, action } = await fixture();
    // Router pays a tenth of the pool price — far below any allowed tolerance.
    await router.setRate(1, 10);
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(await tokenIn.getAddress(), await tokenOut.getAddress(), FEE, ethers.parseEther("5")),
      ),
    ]);
    // Refused for the minimum-out the guard handed the router — the inner
    // reason, not just the wrapper. That is what makes this test evidence.
    await expect(vault.executeAutomation(0))
      .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
      .withArgs(0, ROUTER_MIN_OUT_REJECTION);
    expect(await tokenOut.balanceOf(await vault.getAddress())).to.equal(0n);
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
    await expect(vault.executeAutomation(0))
      .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
      .withArgs(0, action.interface.encodeErrorResult("ZeroTokenIn", []));

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSwapParams(await tokenIn.getAddress(), ethers.ZeroAddress, FEE, 1n),
      ),
    ]);
    await expect(vault.executeAutomation(1))
      .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
      .withArgs(0, action.interface.encodeErrorResult("ZeroTokenOut", []));
  });

  it("reverts when the pair has no pool to price against", async function () {
    const { vault, tokenIn, tokenOut, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        // Fee tier 2500 has no registered pool in the mock factory.
        encodeSwapParams(await tokenIn.getAddress(), await tokenOut.getAddress(), 2500, ethers.parseEther("1")),
      ),
    ]);
    // Named reason: no pool to price against, not an incidental failure.
    const guard = await ethers.getContractAt("SlippageGuard", await vault.getAddress());
    await expect(vault.executeAutomation(0))
      .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
      .withArgs(0, guard.interface.encodeErrorResult("PoolNotFound", []));
  });
});
