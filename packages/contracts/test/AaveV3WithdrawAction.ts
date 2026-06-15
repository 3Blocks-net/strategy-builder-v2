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

function encodeWithdrawParams(
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

// Unit tests for AaveV3WithdrawAction against a mock Aave Pool (no fork). The
// action runs via delegatecall from a real vault. Live-BSC coverage across ≥3
// reserves lives in AaveV3WithdrawAction.fork.ts.
describe("AaveV3WithdrawAction", function () {
  const SUPPLIED = ethers.parseEther("100");

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
    const action = await ethers.deployContract("AaveV3WithdrawAction", [
      await registry.getAddress(),
    ]);

    // Simulate an existing supply position: vault holds aTokens, pool holds the
    // matching underlying to pay the withdrawal out.
    await aToken.mint(await vault.getAddress(), SUPPLIED);
    await asset.transfer(await pool.getAddress(), SUPPLIED);

    return { owner, vault, asset, aToken, pool, action };
  }

  it("reverts construction with a zero registry", async function () {
    const Action = await ethers.getContractFactory("AaveV3WithdrawAction");
    await expect(Action.deploy(ethers.ZeroAddress)).to.be.revertedWith("registry=0");
  });

  it("withdraws a FIXED amount into the vault (no approval needed)", async function () {
    const { vault, asset, aToken, action } = await fixture();
    const amount = ethers.parseEther("30");

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeWithdrawParams(await asset.getAddress(), Mode.FIXED, amount),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await asset.balanceOf(await vault.getAddress())).to.equal(amount);
    expect(await aToken.balanceOf(await vault.getAddress())).to.equal(SUPPLIED - amount);
  });

  it("withdraws FROM_SLOT, reading the amount from context", async function () {
    const { vault, asset, action } = await fixture();
    const amount = ethers.parseEther("10");
    await vault.setContext([enc("uint256", amount)]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeWithdrawParams(await asset.getAddress(), Mode.FROM_SLOT, 0n, 0),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await asset.balanceOf(await vault.getAddress())).to.equal(amount);
  });

  it("withdraw-everything (MAX_AVAILABLE) writes the ACTUAL amount, not the sentinel", async function () {
    const { vault, asset, aToken, action } = await fixture();
    await vault.setContext([enc("uint256", 0n)]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeWithdrawParams(await asset.getAddress(), Mode.MAX_AVAILABLE, 0n, NO_SLOT, 0n, 0),
      ),
    ]);
    await vault.executeAutomation(0);

    // Full position pulled into the vault.
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(SUPPLIED);
    expect(await aToken.balanceOf(await vault.getAddress())).to.equal(0n);

    // The slot holds the real withdrawn amount, NOT type(uint256).max.
    const ctx = await vault.getContext();
    const written = abiCoder.decode(["uint256"], ctx[0])[0] as bigint;
    expect(written).to.equal(SUPPLIED);
    expect(written).to.not.equal(MaxUint256);
  });

  it("reverts on a zero asset", async function () {
    const { vault, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeWithdrawParams(ethers.ZeroAddress, Mode.FIXED, 1n),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(
      vault,
      "ActionExecutionFailed",
    );
  });

  it("reverts on a zero FIXED amount", async function () {
    const { vault, asset, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeWithdrawParams(await asset.getAddress(), Mode.FIXED, 0n),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(
      vault,
      "ActionExecutionFailed",
    );
  });

  it("TARGET_HF no-ops when there is no debt — nothing withdrawn, step proceeds", async function () {
    const { vault, asset, aToken, action } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeWithdrawParams(await asset.getAddress(), Mode.TARGET_HF, 0n, NO_SLOT, ethers.parseEther("1.5")),
      ),
    ]);
    await vault.executeAutomation(0);
    // Position unchanged.
    expect(await aToken.balanceOf(await vault.getAddress())).to.equal(SUPPLIED);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(0n);
  });
});
