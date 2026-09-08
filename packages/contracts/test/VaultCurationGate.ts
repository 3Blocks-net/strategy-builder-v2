import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";
import {
  TargetKind,
  curateActions,
  curateConditions,
  deployCuratedVaultImpl,
} from "./helpers/curated-vault.js";

const { ethers } = await network.connect();

// ── Behaviour under test ─────────────────────────────────────────────────────
//
// A vault reaches a CONDITION by staticcall (it can write nothing) and an ACTION
// by delegatecall (it writes in the VAULT's storage, owner slot included). The
// registry keeps one list per kind for exactly that reason, and the vault checks
// every step against the list of its own kind before it stores an automation.
//
// The tests below pin both halves of that: an uncurated target is refused, and a
// target curated for one kind stays refused for the other — in both directions.
// A single shared list would pass the first half and fail the second.

const abiCoder = AbiCoder.defaultAbiCoder();

const StepType = { CONDITION: 0, ACTION: 1 } as const;
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;

const CHECK_SEL = id("check(bytes,bytes[])").slice(0, 10);
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);

function encodeBalanceParams(
  token: string,
  account: string,
  minBalance: bigint,
  aboveOrEqual: boolean,
): string {
  return abiCoder.encode(
    ["address", "address", "uint256", "bool", "uint32"],
    [token, account, minBalance, aboveOrEqual, NO_SLOT],
  );
}

function encodeTransferParams(
  token: string,
  recipient: string,
  amount: bigint,
): string {
  return abiCoder.encode(
    ["address", "address", "uint256", "uint32", "uint32", "address"],
    [token, recipient, amount, NO_SLOT, NO_SLOT, ethers.ZeroAddress],
  );
}

function conditionStep(target: string, data: string, nextOnTrue = DONE) {
  return {
    stepType: StepType.CONDITION,
    target,
    selector: CHECK_SEL,
    nextOnTrue,
    nextOnFalse: DONE,
    data,
  };
}

function actionStep(target: string, data: string) {
  return {
    stepType: StepType.ACTION,
    target,
    selector: EXECUTE_SEL,
    nextOnTrue: DONE,
    nextOnFalse: DONE,
    data,
  };
}

describe("StrategyBuilderVault curation gate", function () {
  /**
   * A vault with nothing curated yet. Each test curates exactly what it wants to
   * talk about, so "is this target on the right list?" is the only variable.
   */
  async function fixture() {
    const [owner, other, recipient] = await ethers.getSigners();

    const { curatedRegistry, vaultImpl } = await deployCuratedVaultImpl(ethers);
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt(
      "StrategyBuilderVault",
      await factory.getVault(0),
    );

    const condition = await ethers.deployContract("TokenBalanceCondition");
    const action = await ethers.deployContract("ERC20TransferAction");
    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.deploy("Tok", "TOK", ethers.parseEther("1000000"));

    return {
      owner,
      other,
      recipient,
      vault,
      vaultImpl,
      curatedRegistry,
      condition,
      action,
      token,
      conditionAddress: await condition.getAddress(),
      actionAddress: await action.getAddress(),
      tokenAddress: await token.getAddress(),
      vaultAddress: await vault.getAddress(),
    };
  }

  /** A trigger that is always met: "balance >= 0". */
  const alwaysTrue = (token: string, account: string) =>
    encodeBalanceParams(token, account, 0n, true);

  // ── The gate refuses what is not on the list ──────────────────────────────

  describe("standard mode refuses uncurated targets", function () {
    it("createAutomation names the step, the target and the kind", async function () {
      const { vault, condition, conditionAddress, tokenAddress, vaultAddress } =
        await fixture();

      await expect(
        vault.createAutomation([
          conditionStep(conditionAddress, alwaysTrue(tokenAddress, vaultAddress)),
        ]),
      )
        .to.be.revertedWithCustomError(vault, "StepTargetNotCurated")
        .withArgs(0, await condition.getAddress(), TargetKind.Condition);
    });

    it("createAutomation refuses an uncurated action behind a curated condition", async function () {
      const {
        vault,
        curatedRegistry,
        condition,
        conditionAddress,
        actionAddress,
        tokenAddress,
        vaultAddress,
        recipient,
      } = await fixture();
      await curateConditions(curatedRegistry, condition);

      await expect(
        vault.createAutomation([
          conditionStep(conditionAddress, alwaysTrue(tokenAddress, vaultAddress), 1),
          actionStep(
            actionAddress,
            encodeTransferParams(tokenAddress, recipient.address, 1n),
          ),
        ]),
      )
        .to.be.revertedWithCustomError(vault, "StepTargetNotCurated")
        .withArgs(1, actionAddress, TargetKind.Action);
    });

    it("createOwnerAutomation is gated too — it delegatecalls just the same", async function () {
      const { vault, actionAddress, tokenAddress, recipient } = await fixture();

      await expect(
        vault.createOwnerAutomation([
          actionStep(
            actionAddress,
            encodeTransferParams(tokenAddress, recipient.address, 1n),
          ),
        ]),
      )
        .to.be.revertedWithCustomError(vault, "StepTargetNotCurated")
        .withArgs(0, actionAddress, TargetKind.Action);
    });

    it("updateAutomationSteps cannot smuggle an uncurated target into a stored automation", async function () {
      const {
        vault,
        curatedRegistry,
        condition,
        conditionAddress,
        actionAddress,
        tokenAddress,
        vaultAddress,
        recipient,
      } = await fixture();
      await curateConditions(curatedRegistry, condition);

      await vault.createAutomation([
        conditionStep(conditionAddress, alwaysTrue(tokenAddress, vaultAddress)),
      ]);

      await expect(
        vault.updateAutomationSteps(0, [
          conditionStep(conditionAddress, alwaysTrue(tokenAddress, vaultAddress), 1),
          actionStep(
            actionAddress,
            encodeTransferParams(tokenAddress, recipient.address, 1n),
          ),
        ]),
      )
        .to.be.revertedWithCustomError(vault, "StepTargetNotCurated")
        .withArgs(1, actionAddress, TargetKind.Action);
    });

    it("holds for a raw call to the contract, with no client in between", async function () {
      const { vault, owner, conditionAddress, tokenAddress, vaultAddress } =
        await fixture();

      // Hand-built calldata sent straight to the vault address: whatever a UI or
      // backend does or does not check, the contract is the one refusing.
      const calldata = vault.interface.encodeFunctionData("createAutomation", [
        [conditionStep(conditionAddress, alwaysTrue(tokenAddress, vaultAddress))],
      ]);

      await expect(
        owner.sendTransaction({ to: vaultAddress, data: calldata }),
      ).to.be.revertedWithCustomError(vault, "StepTargetNotCurated");
    });

    it("leaves the malformed-step errors alone — shape first, curation second", async function () {
      const { vault } = await fixture();

      // An uncurated target that is also the zero address still gets the precise
      // error. The gate never speaks about a step that is malformed anyway.
      await expect(
        vault.createAutomation([conditionStep(ethers.ZeroAddress, "0x")]),
      ).to.be.revertedWithCustomError(vault, "ZeroTargetAddress");
    });
  });

  // ── One list per kind, in both directions ─────────────────────────────────

  describe("curation is per kind, never shared", function () {
    it("a curated condition is not thereby a legal delegatecall target", async function () {
      const { vault, curatedRegistry, condition, conditionAddress } = await fixture();
      await curateConditions(curatedRegistry, condition);

      // Same address, used as an ACTION this time — which means delegatecall
      // into the vault's own storage. The condition list must not cover that.
      await expect(
        vault.createOwnerAutomation([actionStep(conditionAddress, "0x")]),
      )
        .to.be.revertedWithCustomError(vault, "StepTargetNotCurated")
        .withArgs(0, conditionAddress, TargetKind.Action);
    });

    it("a curated action is not thereby a legal condition target", async function () {
      const { vault, curatedRegistry, action, actionAddress } = await fixture();
      await curateActions(curatedRegistry, action);

      await expect(vault.createAutomation([conditionStep(actionAddress, "0x")]))
        .to.be.revertedWithCustomError(vault, "StepTargetNotCurated")
        .withArgs(0, actionAddress, TargetKind.Condition);
    });

    it("curating the same address for both kinds is two deliberate decisions", async function () {
      const {
        vault,
        curatedRegistry,
        condition,
        action,
        conditionAddress,
        actionAddress,
        tokenAddress,
        vaultAddress,
        recipient,
      } = await fixture();
      await curateConditions(curatedRegistry, condition);
      await curateActions(curatedRegistry, action);

      await expect(
        vault.createAutomation([
          conditionStep(conditionAddress, alwaysTrue(tokenAddress, vaultAddress), 1),
          actionStep(
            actionAddress,
            encodeTransferParams(tokenAddress, recipient.address, 1n),
          ),
        ]),
      ).to.emit(vault, "AutomationCreated");
    });
  });

  // ── The gate sits on the deploy path, not on the execution path ───────────

  describe("automations that are already stored", function () {
    it("keep running after their target is removed from the list", async function () {
      const {
        vault,
        curatedRegistry,
        action,
        actionAddress,
        token,
        tokenAddress,
        vaultAddress,
        recipient,
      } = await fixture();
      await curateActions(curatedRegistry, action);
      await token.transfer(vaultAddress, ethers.parseEther("10"));

      await vault.createOwnerAutomation([
        actionStep(
          actionAddress,
          encodeTransferParams(tokenAddress, recipient.address, ethers.parseEther("1")),
        ),
      ]);

      await curatedRegistry.removeCuratedTarget(actionAddress, TargetKind.Action);

      const before = await token.balanceOf(recipient.address);
      await vault.executeAutomation(0);
      expect((await token.balanceOf(recipient.address)) - before).to.equal(
        ethers.parseEther("1"),
      );
    });

    it("but no new automation can be deployed against it", async function () {
      const { vault, curatedRegistry, action, actionAddress, tokenAddress, recipient } =
        await fixture();
      await curateActions(curatedRegistry, action);
      await vault.createOwnerAutomation([
        actionStep(
          actionAddress,
          encodeTransferParams(tokenAddress, recipient.address, 1n),
        ),
      ]);

      await curatedRegistry.removeCuratedTarget(actionAddress, TargetKind.Action);

      await expect(
        vault.createOwnerAutomation([
          actionStep(
            actionAddress,
            encodeTransferParams(tokenAddress, recipient.address, 1n),
          ),
        ]),
      ).to.be.revertedWithCustomError(vault, "StepTargetNotCurated");
    });
  });

  // ── Expert mode ───────────────────────────────────────────────────────────

  describe("expert mode", function () {
    it("is off when a vault is created", async function () {
      const { vault } = await fixture();
      expect(await vault.expertMode()).to.equal(false);
    });

    it("is readable on-chain and emits on every change", async function () {
      const { vault } = await fixture();

      await expect(vault.setExpertMode(true))
        .to.emit(vault, "ExpertModeChanged")
        .withArgs(true);
      expect(await vault.expertMode()).to.equal(true);

      await expect(vault.setExpertMode(false))
        .to.emit(vault, "ExpertModeChanged")
        .withArgs(false);
      expect(await vault.expertMode()).to.equal(false);
    });

    it("cannot be set by anyone but the vault owner", async function () {
      const { vault, other } = await fixture();

      await expect(
        vault.connect(other).setExpertMode(true),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      expect(await vault.expertMode()).to.equal(false);
    });

    it("cannot be lifted by the curator either — it is the vault owner's switch", async function () {
      const { vault, curatedRegistry, other } = await fixture();
      // The curator owns the list, not the vaults that read it.
      expect(await curatedRegistry.curator()).to.not.equal(other.address);
      await expect(
        vault.connect(other).setExpertMode(true),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("lets an uncurated target through while it is on", async function () {
      const { vault, actionAddress, tokenAddress, recipient } = await fixture();
      await vault.setExpertMode(true);

      await expect(
        vault.createOwnerAutomation([
          actionStep(
            actionAddress,
            encodeTransferParams(tokenAddress, recipient.address, 1n),
          ),
        ]),
      ).to.emit(vault, "AutomationCreated");
    });

    it("gates new deploys again once it is off, without stopping what it allowed", async function () {
      const {
        vault,
        actionAddress,
        token,
        tokenAddress,
        vaultAddress,
        recipient,
      } = await fixture();
      await token.transfer(vaultAddress, ethers.parseEther("10"));

      await vault.setExpertMode(true);
      await vault.createOwnerAutomation([
        actionStep(
          actionAddress,
          encodeTransferParams(tokenAddress, recipient.address, ethers.parseEther("1")),
        ),
      ]);
      await vault.setExpertMode(false);

      // What was stored keeps running …
      const before = await token.balanceOf(recipient.address);
      await vault.executeAutomation(0);
      expect((await token.balanceOf(recipient.address)) - before).to.equal(
        ethers.parseEther("1"),
      );

      // … and nothing new gets in.
      await expect(
        vault.createOwnerAutomation([
          actionStep(
            actionAddress,
            encodeTransferParams(tokenAddress, recipient.address, 1n),
          ),
        ]),
      ).to.be.revertedWithCustomError(vault, "StepTargetNotCurated");
    });

    it("is per vault — one owner's waiver does not touch another vault", async function () {
      const { vault, vaultImpl, other, actionAddress, tokenAddress, recipient } =
        await fixture();
      const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.createVault(other.address, ethers.ZeroAddress, ethers.ZeroHash);
      const otherVault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );

      await vault.setExpertMode(true);

      expect(await otherVault.expertMode()).to.equal(false);
      await expect(
        otherVault.connect(other).createOwnerAutomation([
          actionStep(
            actionAddress,
            encodeTransferParams(tokenAddress, recipient.address, 1n),
          ),
        ]),
      ).to.be.revertedWithCustomError(otherVault, "StepTargetNotCurated");
    });
  });

  // ── Which list a vault reads ──────────────────────────────────────────────

  describe("the registry a vault checks against", function () {
    it("is readable on-chain", async function () {
      const { vault, curatedRegistry } = await fixture();
      expect(await vault.curatedRegistry()).to.equal(
        await curatedRegistry.getAddress(),
      );
    });

    it("cannot be left out — an implementation without a list is refused", async function () {
      const { vaultImpl } = await fixture();
      await expect(
        ethers.deployContract("StrategyBuilderVault", [ethers.ZeroAddress]),
      ).to.be.revertedWithCustomError(vaultImpl, "ZeroCuratedRegistry");
    });

    it("cannot point at an address that holds no code", async function () {
      const { vaultImpl, other } = await fixture();
      await expect(ethers.deployContract("StrategyBuilderVault", [other.address]))
        .to.be.revertedWithCustomError(vaultImpl, "CuratedRegistryNotAContract")
        .withArgs(other.address);
    });
  });
});
