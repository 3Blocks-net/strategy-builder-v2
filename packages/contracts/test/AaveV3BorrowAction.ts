import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

const { ethers } = await network.connect();

const abiCoder = AbiCoder.defaultAbiCoder();
const enc = (type: string, value: unknown) => abiCoder.encode([type], [value]);
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;

const Mode = { FIXED: 0, FROM_SLOT: 1, MAX_AVAILABLE: 2, TARGET_HF: 3 } as const;

function encodeBorrowParams(
  asset: string,
  mode: number,
  amount: bigint,
  amountFromSlot: number = NO_SLOT,
  targetHealthFactor: bigint = 0n,
  amountToSlot: number = NO_SLOT,
): string {
  return abiCoder.encode(
    ["address", "uint8", "uint256", "uint32", "uint256", "uint32"],
    [asset, mode, amount, amountFromSlot, targetHealthFactor, amountToSlot],
  );
}

function actionStep(target: string, data: string, nextOnTrue = DONE) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue, nextOnFalse: DONE, data };
}

// Unit tests for AaveV3BorrowAction against a mock Aave Pool (no fork). The
// action runs via delegatecall from a real vault. Live-BSC coverage across ≥3
// reserves lives in AaveV3BorrowAction.fork.ts.
describe("AaveV3BorrowAction", function () {
  const LIQUIDITY = ethers.parseEther("1000");

  async function fixture() {
    const [owner] = await ethers.getSigners();

    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt(
      "StrategyBuilderVault",
      await factory.getVault(0),
    );

    const MockToken = await ethers.getContractFactory("MockERC20");
    const asset = await MockToken.deploy("Asset", "AST", ethers.parseEther("1000000"));
    const pool = await ethers.deployContract("MockAaveV3Pool");

    const provider = await ethers.deployContract("MockPoolAddressesProvider", [
      await pool.getAddress(),
      ethers.Wallet.createRandom().address,
    ]);
    const registry = await ethers.deployContract("AaveV3Registry", [
      await provider.getAddress(),
    ]);
    const action = await ethers.deployContract("AaveV3BorrowAction", [
      await registry.getAddress(),
    ]);

    // Fund the pool with borrowable liquidity.
    await asset.transfer(await pool.getAddress(), LIQUIDITY);

    return { owner, vault, asset, pool, action };
  }

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("AaveV3BorrowAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revertedWith("registry=0");
  });

  it("borrows a FIXED amount into the vault and records debt", async function () {
    const { vault, asset, pool, action } = await fixture();
    const amount = ethers.parseEther("20");

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeBorrowParams(await asset.getAddress(), Mode.FIXED, amount),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await asset.balanceOf(await vault.getAddress())).to.equal(amount);
    expect(await pool.debtOf(await asset.getAddress(), await vault.getAddress())).to.equal(amount);
  });

  it("borrows FROM_SLOT and writes the borrowed amount to a slot", async function () {
    const { vault, asset, action } = await fixture();
    const amount = ethers.parseEther("12");
    await vault.setContext([enc("uint256", amount), enc("uint256", 0n)]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeBorrowParams(await asset.getAddress(), Mode.FROM_SLOT, 0n, 0, 0n, 1),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await asset.balanceOf(await vault.getAddress())).to.equal(amount);
    const ctx = await vault.getContext();
    expect(abiCoder.decode(["uint256"], ctx[1])[0]).to.equal(amount);
  });

  it("always uses the variable rate (mode 2) — borrow succeeds", async function () {
    // The mock ignores the rate mode, but the action must pass 2; this asserts
    // the happy path runs (the stable-rate path would revert on real Aave).
    const { vault, asset, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeBorrowParams(await asset.getAddress(), Mode.FIXED, ethers.parseEther("1")),
      ),
    ]);
    await vault.executeAutomation(0);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("1"));
  });

  it("reverts on a zero asset", async function () {
    const { vault, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeBorrowParams(ethers.ZeroAddress, Mode.FIXED, 1n)),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });

  it("reverts on a zero FIXED amount", async function () {
    const { vault, asset, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeBorrowParams(await asset.getAddress(), Mode.FIXED, 0n)),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });

  it("MAX_AVAILABLE no-ops with no borrowing power (availableBorrows = 0)", async function () {
    const { vault, asset, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeBorrowParams(await asset.getAddress(), Mode.MAX_AVAILABLE, 0n)),
    ]);
    await vault.executeAutomation(0);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(0n);
  });

  it("MAX_AVAILABLE borrows availableBorrows minus the haircut", async function () {
    const { vault, asset, pool, action } = await fixture();
    const oracle = await ethers.deployContract("MockAaveOracle");
    await oracle.setPrice(await asset.getAddress(), 1n * 10n ** 8n); // $1 (8-dec)
    // availableBorrowsBase = $100 (8-dec); LT 8000.
    await pool.setUserAccountData(await vault.getAddress(), 0n, 0n, 100n * 10n ** 8n, 8000n);

    // Point the registry's provider oracle at the mock by redeploying via a
    // provider that returns it.
    const provider = await ethers.deployContract("MockPoolAddressesProvider", [
      await pool.getAddress(),
      await oracle.getAddress(),
    ]);
    const registry = await ethers.deployContract("AaveV3Registry", [await provider.getAddress()]);
    const action2 = await ethers.deployContract("AaveV3BorrowAction", [await registry.getAddress()]);

    await vault.createOwnerAutomation([
      actionStep(await action2.getAddress(), encodeBorrowParams(await asset.getAddress(), Mode.MAX_AVAILABLE, 0n)),
    ]);
    await vault.executeAutomation(0);

    // 100 - 0.5% haircut = 99.5 tokens (18-dec, price $1).
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("99.5"));
  });

  it("TARGET_HF no-ops when there is no collateral (no borrowing power)", async function () {
    const { vault, asset, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeBorrowParams(await asset.getAddress(), Mode.TARGET_HF, 0n, NO_SLOT, ethers.parseEther("1.5")),
      ),
    ]);
    await vault.executeAutomation(0);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(0n);
  });

  it("TARGET_HF rejects a target at/below the 1.05 floor", async function () {
    const { vault, asset, pool, action } = await fixture();
    // Give some collateral/debt so it would otherwise compute an amount.
    await pool.setUserAccountData(await vault.getAddress(), 1000n * 10n ** 8n, 0n, 0n, 8000n);
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeBorrowParams(await asset.getAddress(), Mode.TARGET_HF, 0n, NO_SLOT, ethers.parseEther("1.0")),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });
});
