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

function encodeSupplyParams(
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
  return {
    stepType: 1, // ACTION
    target,
    selector: EXECUTE_SEL,
    nextOnTrue,
    nextOnFalse: DONE,
    data,
  };
}

// Unit tests for AaveV3SupplyAction against a mock Aave Pool (no fork). The
// action runs via delegatecall from a real vault (owner automation, step 0 =
// action) so address(this) == vault throughout. Fork coverage across ≥3 live
// BSC reserves lives in AaveV3SupplyAction.fork.ts.
describe("AaveV3SupplyAction", function () {
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

    const aToken = await ethers.deployContract("MockAToken", ["aAsset", "aAST"]);
    const pool = await ethers.deployContract("MockAaveV3Pool");
    await pool.setAToken(await asset.getAddress(), await aToken.getAddress());

    const provider = await ethers.deployContract("MockPoolAddressesProvider", [
      await pool.getAddress(),
      ethers.Wallet.createRandom().address,
    ]);
    const registry = await ethers.deployContract("AaveV3Registry", [
      await provider.getAddress(),
    ]);
    const action = await ethers.deployContract("AaveV3SupplyAction", [
      await registry.getAddress(),
    ]);

    // Fund the vault with the asset.
    await asset.transfer(await vault.getAddress(), ethers.parseEther("100"));

    return { owner, vault, asset, aToken, pool, action };
  }

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("AaveV3SupplyAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revertedWith("registry=0");
  });

  it("supplies a FIXED amount and mints aTokens to the vault", async function () {
    const { vault, asset, aToken, pool, action } = await fixture();
    const amount = ethers.parseEther("25");

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSupplyParams(await asset.getAddress(), Mode.FIXED, amount),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await aToken.balanceOf(await vault.getAddress())).to.equal(amount);
    // approval hygiene: allowance back to 0 after supply
    expect(
      await asset.allowance(await vault.getAddress(), await pool.getAddress()),
    ).to.equal(0n);
  });

  it("supplies MAX_AVAILABLE = the full vault balance", async function () {
    const { vault, asset, aToken, action } = await fixture();
    const full = await asset.balanceOf(await vault.getAddress());

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSupplyParams(await asset.getAddress(), Mode.MAX_AVAILABLE, 0n),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await aToken.balanceOf(await vault.getAddress())).to.equal(full);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(0n);
  });

  it("supplies FROM_SLOT, reading the amount from context", async function () {
    const { vault, asset, aToken, action } = await fixture();
    const amount = ethers.parseEther("10");
    await vault.setContext([enc("uint256", amount)]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSupplyParams(await asset.getAddress(), Mode.FROM_SLOT, 0n, 0),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await aToken.balanceOf(await vault.getAddress())).to.equal(amount);
  });

  it("writes the supplied amount to the output slot when requested", async function () {
    const { vault, asset, action } = await fixture();
    const amount = ethers.parseEther("7");
    await vault.setContext([enc("uint256", 0n)]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSupplyParams(await asset.getAddress(), Mode.FIXED, amount, NO_SLOT, 0n, 0),
      ),
    ]);
    await vault.executeAutomation(0);

    const ctx = await vault.getContext();
    expect(abiCoder.decode(["uint256"], ctx[0])[0]).to.equal(amount);
  });

  it("reverts on a zero asset", async function () {
    const { vault, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSupplyParams(ethers.ZeroAddress, Mode.FIXED, 1n),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(
      vault,
      "ActionExecutionFailed",
    );
  });

  it("reverts on a zero resolved amount", async function () {
    const { vault, asset, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSupplyParams(await asset.getAddress(), Mode.FIXED, 0n),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(
      vault,
      "ActionExecutionFailed",
    );
  });

  it("TARGET_HF no-ops when there is no debt (HF infinite) — step proceeds", async function () {
    const { vault, asset, aToken, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSupplyParams(await asset.getAddress(), Mode.TARGET_HF, 0n, NO_SLOT, ethers.parseEther("1.5")),
      ),
    ]);
    // No revert; nothing supplied (no debt ⇒ HF already ≥ target).
    await vault.executeAutomation(0);
    expect(await aToken.balanceOf(await vault.getAddress())).to.equal(0n);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("100"));
  });

  it("TARGET_HF rejects a target at/below the 1.05 floor", async function () {
    const { vault, asset, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeSupplyParams(await asset.getAddress(), Mode.TARGET_HF, 0n, NO_SLOT, ethers.parseEther("1.05")),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(
      vault,
      "ActionExecutionFailed",
    );
  });
});
