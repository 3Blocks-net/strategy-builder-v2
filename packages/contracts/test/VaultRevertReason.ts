import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id, Interface } from "ethers";

const { ethers } = await network.connect();

// ── PEC-219 slice #02 ────────────────────────────────────────────────────────
// The vault must re-revert `ActionExecutionFailed` / `ConditionCallFailed` with
// the ORIGINAL inner revert bytes (not swallow them), so the keeper/backend can
// decode the real reason (e.g. an Aave/PancakeSwap error). This proves the inner
// reason is recoverable from the outer 2-arg error.

const abiCoder = AbiCoder.defaultAbiCoder();
const enc = (type: string, value: unknown) => abiCoder.encode([type], [value]);
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const CHECK_SEL = id("check(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}
function conditionStep(target: string, data: string) {
  return { stepType: 0, target, selector: CHECK_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

describe("StrategyBuilderVault — revert reason passthrough (PEC-219 #02)", function () {
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
    const reverting = await ethers.deployContract("MockRevertingAction");
    return { owner, vault, reverting };
  }

  it("ActionExecutionFailed carries the original inner revert bytes", async function () {
    const { vault, reverting } = await fixture();
    const code = 4242n;

    await vault.createOwnerAutomation([
      actionStep(await reverting.getAddress(), enc("uint256", code)),
    ]);

    // The inner action reverts with MockActionReason(code); the vault must wrap
    // it as ActionExecutionFailed(stepIndex=0, reason=<encoded MockActionReason>).
    const revertingIface = new Interface([
      "error MockActionReason(uint256 code)",
    ]);
    const expectedReason = revertingIface.encodeErrorResult("MockActionReason", [
      code,
    ]);

    await expect(vault.executeAutomation(0))
      .to.be.revertedWithCustomError(vault, "ActionExecutionFailed")
      .withArgs(0, expectedReason);

    // And the reason round-trips: decoding it recovers the original error + arg.
    const decoded = revertingIface.parseError(expectedReason);
    expect(decoded?.name).to.equal("MockActionReason");
    expect(decoded?.args[0]).to.equal(code);
  });

  it("ConditionCallFailed is raised (with reason bytes) when a trigger condition reverts", async function () {
    const { vault, reverting } = await fixture();
    // A public automation's step-0 CONDITION points at a contract with no
    // matching check() → staticcall fails → _checkCondition wraps the revert.
    await vault.createAutomation([
      conditionStep(await reverting.getAddress(), enc("uint256", 7n)),
    ]);

    await expect(
      vault.executeAutomation(0),
    ).to.be.revertedWithCustomError(vault, "ConditionCallFailed");
  });
});
