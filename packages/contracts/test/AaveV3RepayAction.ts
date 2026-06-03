import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id, MaxUint256 } from "ethers";

const { ethers } = await network.connect();

const abiCoder = AbiCoder.defaultAbiCoder();
const enc = (type: string, value: unknown) => abiCoder.encode([type], [value]);
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;

const Mode = { FIXED: 0, FROM_SLOT: 1, MAX_AVAILABLE: 2, TARGET_HF: 3 } as const;

function encodeRepayParams(
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

// Unit tests for AaveV3RepayAction against a mock Aave Pool (no fork). The
// action runs via delegatecall from a real vault. Live-BSC coverage lives in
// AaveV3RepayAction.fork.ts.
describe("AaveV3RepayAction", function () {
  async function fixture(debt: bigint, vaultBalance: bigint) {
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
    const debtToken = await ethers.deployContract("MockAToken", ["vdAsset", "vdAST"]);
    const pool = await ethers.deployContract("MockAaveV3Pool");
    await pool.setDebtToken(await asset.getAddress(), await debtToken.getAddress());

    const provider = await ethers.deployContract("MockPoolAddressesProvider", [
      await pool.getAddress(),
      ethers.Wallet.createRandom().address,
    ]);
    const registry = await ethers.deployContract("AaveV3Registry", [
      await provider.getAddress(),
    ]);
    const action = await ethers.deployContract("AaveV3RepayAction", [
      await registry.getAddress(),
    ]);

    // Seed a debt position and fund the vault with tokens to repay it.
    await pool.seedDebt(await asset.getAddress(), await vault.getAddress(), debt);
    if (vaultBalance > 0n) {
      await asset.transfer(await vault.getAddress(), vaultBalance);
    }

    return { owner, vault, asset, debtToken, pool, action };
  }

  const vaultAddr = async (v: any) => await v.getAddress();

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("AaveV3RepayAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revertedWith("registry=0");
  });

  it("repays a partial FIXED amount and resets the allowance to 0", async function () {
    const { vault, asset, pool, action } = await fixture(ethers.parseEther("50"), ethers.parseEther("100"));
    const repay = ethers.parseEther("20");

    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeRepayParams(await asset.getAddress(), Mode.FIXED, repay)),
    ]);
    await vault.executeAutomation(0);

    expect(await pool.debtOf(await asset.getAddress(), await vault.getAddress())).to.equal(ethers.parseEther("30"));
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("80"));
    expect(await asset.allowance(await vault.getAddress(), await pool.getAddress())).to.equal(0n);
  });

  it("repays FROM_SLOT, reading the amount from context", async function () {
    const { vault, asset, pool, action } = await fixture(ethers.parseEther("50"), ethers.parseEther("100"));
    await vault.setContext([enc("uint256", ethers.parseEther("15"))]);

    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeRepayParams(await asset.getAddress(), Mode.FROM_SLOT, 0n, 0)),
    ]);
    await vault.executeAutomation(0);

    expect(await pool.debtOf(await asset.getAddress(), await vault.getAddress())).to.equal(ethers.parseEther("35"));
  });

  it("repay-full-debt (MAX) clears the debt and writes the ACTUAL amount (≠ sentinel)", async function () {
    const { vault, asset, pool, action } = await fixture(ethers.parseEther("30"), ethers.parseEther("80"));
    await vault.setContext([enc("uint256", 0n)]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeRepayParams(await asset.getAddress(), Mode.MAX_AVAILABLE, 0n, NO_SLOT, 0n, 0),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await pool.debtOf(await asset.getAddress(), await vault.getAddress())).to.equal(0n);
    // 80 balance - 30 debt repaid = 50 left
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("50"));
    expect(await asset.allowance(await vault.getAddress(), await pool.getAddress())).to.equal(0n);

    const ctx = await vault.getContext();
    const written = abiCoder.decode(["uint256"], ctx[0])[0] as bigint;
    expect(written).to.equal(ethers.parseEther("30"));
    expect(written).to.not.equal(MaxUint256);
  });

  it("repay-full-debt caps at the balance when balance < debt (revert-free)", async function () {
    const { vault, asset, pool, action } = await fixture(ethers.parseEther("100"), ethers.parseEther("40"));

    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeRepayParams(await asset.getAddress(), Mode.MAX_AVAILABLE, 0n)),
    ]);
    await vault.executeAutomation(0);

    // Repaid only the 40 we held; 60 debt remains.
    expect(await pool.debtOf(await asset.getAddress(), await vault.getAddress())).to.equal(ethers.parseEther("60"));
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(0n);
  });

  it("repay-full-debt is a no-op when there is no debt (revert-free)", async function () {
    const { vault, asset, pool, action } = await fixture(0n, ethers.parseEther("50"));
    await vault.setContext([enc("uint256", 123n)]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeRepayParams(await asset.getAddress(), Mode.MAX_AVAILABLE, 0n, NO_SLOT, 0n, 0),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await asset.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("50"));
    const ctx = await vault.getContext();
    expect(abiCoder.decode(["uint256"], ctx[0])[0]).to.equal(0n);
  });

  it("reverts on a zero asset", async function () {
    const { vault, action } = await fixture(ethers.parseEther("10"), ethers.parseEther("10"));
    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeRepayParams(ethers.ZeroAddress, Mode.FIXED, 1n)),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });

  it("reverts on a zero FIXED amount", async function () {
    const { vault, asset, action } = await fixture(ethers.parseEther("10"), ethers.parseEther("10"));
    await vault.createOwnerAutomation([
      actionStep(await action.getAddress(), encodeRepayParams(await asset.getAddress(), Mode.FIXED, 0n)),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });

  it("TARGET_HF no-ops when getUserAccountData reports no debt — step proceeds", async function () {
    const { vault, asset, action } = await fixture(ethers.parseEther("10"), ethers.parseEther("10"));
    // accountData unset ⇒ totalDebtBase = 0 ⇒ no-op (no oracle read).
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeRepayParams(await asset.getAddress(), Mode.TARGET_HF, 0n, NO_SLOT, ethers.parseEther("1.5")),
      ),
    ]);
    await vault.executeAutomation(0);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("10"));
  });

  it("TARGET_HF rejects a target at/below the 1.05 floor", async function () {
    const { vault, asset, pool, action } = await fixture(ethers.parseEther("10"), ethers.parseEther("10"));
    await pool.setUserAccountData(await vault.getAddress(), 1000n * 10n ** 8n, 500n * 10n ** 8n, 0n, 8000n);
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeRepayParams(await asset.getAddress(), Mode.TARGET_HF, 0n, NO_SLOT, ethers.parseEther("1.0")),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });
});
