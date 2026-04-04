import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

const { ethers } = await network.connect();

// ─── Helpers ───────────────────────────────────────────────────────────────

const abiCoder = AbiCoder.defaultAbiCoder();
const enc = (type: string, value: unknown) => abiCoder.encode([type], [value]);
const dec = (type: string, slot: string) =>
  abiCoder.decode([type], slot)[0] as bigint;

const StepType = { CONDITION: 0, ACTION: 1 } as const;
const DONE = 0xffffffff; // type(uint32).max
const NO_SLOT = 0xffffffff;

// Pre-computed function selectors (first 4 bytes of keccak256 of the ABI signature).
const CHECK_SEL      = id("check(bytes,bytes[])").slice(0, 10);           // ICondition.check
const EXECUTE_SEL    = id("execute(bytes,bytes[])").slice(0, 10);         // IAction.execute
const AFTER_EXEC_SEL = id("afterExecution(bytes,bytes[])").slice(0, 10); // IUpdatableCondition.afterExecution

// ─── Param encoders ────────────────────────────────────────────────────────

function encodeBalanceParams(
  token: string,
  account: string,
  minBalance: bigint,
  aboveOrEqual: boolean,
  minBalanceFromSlot: number = NO_SLOT,
): string {
  return abiCoder.encode(
    ["address", "address", "uint256", "bool", "uint32"],
    [token, account, minBalance, aboveOrEqual, minBalanceFromSlot],
  );
}

function encodeIntervalParams(interval: bigint, timeSlot: number): string {
  return abiCoder.encode(["uint256", "uint32"], [interval, timeSlot]);
}

function encodeTransferParams(
  token: string,
  recipient: string,
  amount: bigint,
  amountFromSlot: number = NO_SLOT,
  amountToSlot: number = NO_SLOT,
): string {
  return abiCoder.encode(
    ["address", "address", "uint256", "uint32", "uint32"],
    [token, recipient, amount, amountFromSlot, amountToSlot],
  );
}

// ─── Step builders ─────────────────────────────────────────────────────────

function conditionStep(
  target: string,
  data: string,
  nextOnTrue: number,
  nextOnFalse = DONE,
  sel = CHECK_SEL,
) {
  return {
    stepType: StepType.CONDITION,
    target,
    selector: sel,
    nextOnTrue,
    nextOnFalse,
    data,
  };
}

function actionStep(
  target: string,
  data: string,
  nextOnTrue = DONE,
  sel = EXECUTE_SEL,
) {
  return {
    stepType: StepType.ACTION,
    target,
    selector: sel,
    nextOnTrue,
    nextOnFalse: DONE,
    data,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("StrategyBuilderVault", function () {
  async function deployVaultFixture() {
    const [owner, executor, recipient, other] = await ethers.getSigners();

    // Deploy vault impl → factory → set impl → create vault proxy (ERC1967 CREATE2)
    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    // Pass owner as creator so vault.creator() == owner by default.
    // No priceOracle for the base fixture — fee accrual disabled.
    await factory.createVault(
      owner.address,
      ethers.ZeroAddress,
      owner.address,
      ethers.ZeroHash,
    );
    const vault = await ethers.getContractAt(
      "StrategyBuilderVault",
      await factory.getVault(0),
    );

    const condition = await ethers.deployContract("TokenBalanceCondition");
    const action = await ethers.deployContract("ERC20TransferAction");

    const MockToken = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockToken.deploy(
      "TokenA",
      "TKA",
      ethers.parseEther("1000000"),
    );
    const tokenB = await MockToken.deploy(
      "TokenB",
      "TKB",
      ethers.parseEther("1000000"),
    );

    return {
      vault,
      factory,
      condition,
      action,
      tokenA,
      tokenB,
      owner,
      executor,
      recipient,
      other,
    };
  }

  // ── Deployment ──────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the deployer as owner", async function () {
      const { vault, owner } = await deployVaultFixture();
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("starts with zero automations and empty context", async function () {
      const { vault } = await deployVaultFixture();
      expect(await vault.automationCount()).to.equal(0n);
      expect((await vault.getContext()).length).to.equal(0);
    });

    it("feeRegistry defaults to address(0) when factory has none set", async function () {
      const { vault } = await deployVaultFixture();
      expect(await vault.feeRegistry()).to.equal(ethers.ZeroAddress);
    });
  });

  // ── createAutomation ────────────────────────────────────────────────────

  describe("createAutomation", function () {
    it("reverts for non-owner", async function () {
      const { vault, condition, other } = await deployVaultFixture();
      await expect(
        vault
          .connect(other)
          .createAutomation([
            conditionStep(await condition.getAddress(), "0x", DONE),
          ]),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("reverts when steps array is empty", async function () {
      const { vault } = await deployVaultFixture();
      await expect(vault.createAutomation([])).to.be.revertedWithCustomError(
        vault,
        "NoSteps",
      );
    });

    it("reverts when first step is not a Condition", async function () {
      const { vault, action } = await deployVaultFixture();
      await expect(
        vault.createAutomation([actionStep(await action.getAddress(), "0x")]),
      ).to.be.revertedWithCustomError(vault, "FirstStepMustBeCondition");
    });

    it("reverts on out-of-bounds nextOnTrue reference", async function () {
      const { vault, condition } = await deployVaultFixture();
      await expect(
        vault.createAutomation([
          conditionStep(await condition.getAddress(), "0x", 5, DONE),
        ]),
      ).to.be.revertedWithCustomError(vault, "InvalidStepReference");
    });

    it("creates automation and emits AutomationCreated", async function () {
      const { vault, condition } = await deployVaultFixture();
      await expect(
        vault.createAutomation([
          conditionStep(await condition.getAddress(), "0x", DONE),
        ]),
      )
        .to.emit(vault, "AutomationCreated")
        .withArgs(0n, 1n);
      expect(await vault.automationCount()).to.equal(1n);
    });

    it("does not affect the shared context", async function () {
      const { vault, condition } = await deployVaultFixture();
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), "0x", DONE),
      ]);
      expect((await vault.getContext()).length).to.equal(0);
    });
  });

  // ── Shared context management ────────────────────────────────────────────

  describe("setContext / setContextSlot", function () {
    it("owner can initialise the vault context", async function () {
      const { vault } = await deployVaultFixture();
      await vault.setContext([enc("uint256", 1n), enc("uint256", 2n)]);
      const ctx = await vault.getContext();
      expect(ctx.length).to.equal(2);
      expect(dec("uint256", ctx[0])).to.equal(1n);
      expect(dec("uint256", ctx[1])).to.equal(2n);
    });

    it("setContext resizes the slot array", async function () {
      const { vault } = await deployVaultFixture();
      await vault.setContext([
        enc("uint256", 1n),
        enc("uint256", 2n),
        enc("uint256", 3n),
      ]);
      expect((await vault.getContext()).length).to.equal(3);
      await vault.setContext([enc("uint256", 99n)]);
      expect((await vault.getContext()).length).to.equal(1);
    });

    it("owner can override a single slot", async function () {
      const { vault } = await deployVaultFixture();
      await vault.setContext([enc("uint256", 0n), enc("uint256", 0n)]);
      await expect(vault.setContextSlot(1, enc("uint256", 42n)))
        .to.emit(vault, "ContextSlotSet")
        .withArgs(1n);
      const ctx = await vault.getContext();
      expect(dec("uint256", ctx[1])).to.equal(42n);
    });

    it("reverts when slot is out of bounds", async function () {
      const { vault } = await deployVaultFixture();
      await expect(vault.setContextSlot(0, "0x")).to.be.revertedWithCustomError(
        vault,
        "ContextSlotOutOfBounds",
      );
    });

    it("non-owner cannot set context", async function () {
      const { vault, other } = await deployVaultFixture();
      await expect(
        vault.connect(other).setContext([enc("uint256", 1n)]),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  // ── executeAutomation ───────────────────────────────────────────────────

  describe("executeAutomation (basic)", function () {
    it("reverts for non-existent automation", async function () {
      const { vault } = await deployVaultFixture();
      await expect(vault.executeAutomation(99)).to.be.revertedWithCustomError(
        vault,
        "AutomationDoesNotExist",
      );
    });

    it("reverts when automation is inactive", async function () {
      const { vault, condition } = await deployVaultFixture();
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), "0x", DONE),
      ]);
      await vault.setAutomationActive(0, false);
      await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(
        vault,
        "AutomationNotActive",
      );
    });

    it("trigger false → non-owner reverts with TriggerNotMet", async function () {
      const { vault, condition, action, tokenA, executor, recipient } =
        await deployVaultFixture();

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        await executor.getAddress(),
        ethers.parseEther("9999999"),
        true,
      );
      const actionData = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        1n,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      await expect(vault.connect(executor).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "TriggerNotMet");
      expect(await tokenA.balanceOf(recipient.address)).to.equal(0n);
    });

    it("trigger true → executes action via delegatecall", async function () {
      const { vault, condition, action, tokenA, executor, recipient } =
        await deployVaultFixture();

      const vaultAddress = await vault.getAddress();
      const amount = ethers.parseEther("50");
      await tokenA.transfer(vaultAddress, amount);

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        amount,
        true,
      );
      const actionData = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        amount,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);
      await vault.connect(executor).executeAutomation(0);

      expect(await tokenA.balanceOf(vaultAddress)).to.equal(0n);
      expect(await tokenA.balanceOf(recipient.address)).to.equal(amount);
    });

    it("condition false branches to alternative action", async function () {
      const { vault, condition, action, tokenA, executor, recipient, other } =
        await deployVaultFixture();

      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("5"));

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        ethers.parseEther("50"),
        true,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, 2),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("50"),
          ),
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await other.getAddress(),
            ethers.parseEther("5"),
          ),
        ),
      ]);

      await vault.executeAutomation(0);

      expect(await tokenA.balanceOf(recipient.address)).to.equal(0n);
      expect(await tokenA.balanceOf(await other.getAddress())).to.equal(
        ethers.parseEther("5"),
      );
    });
  });

  // ── Context — shared across automations ─────────────────────────────────

  describe("executeAutomation (shared context)", function () {
    it("action writes to a context slot — value persists after execution", async function () {
      const { vault, condition, action, tokenA, recipient } =
        await deployVaultFixture();

      const vaultAddress = await vault.getAddress();
      const amount = ethers.parseEther("30");
      await tokenA.transfer(vaultAddress, amount);
      await vault.setContext([enc("uint256", 0n)]);

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      const actionData = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        amount,
        NO_SLOT,
        0,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);
      await vault.executeAutomation(0);

      const ctx = await vault.getContext();
      expect(dec("uint256", ctx[0])).to.equal(amount);
    });

    it("second automation reads context written by the first", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        tokenB,
        executor,
        recipient,
        other,
      } = await deployVaultFixture();

      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("100"));
      await tokenB.transfer(vaultAddress, ethers.parseEther("100"));
      await vault.setContext([enc("uint256", 0n)]);

      const triggerA = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      const transferA = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        ethers.parseEther("50"),
        NO_SLOT,
        0,
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerA, 1, DONE),
        actionStep(await action.getAddress(), transferA),
      ]);

      const triggerB = encodeBalanceParams(
        await tokenB.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      const transferB = encodeTransferParams(
        await tokenB.getAddress(),
        await other.getAddress(),
        0n,
        0,
        NO_SLOT,
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerB, 1, DONE),
        actionStep(await action.getAddress(), transferB),
      ]);

      await vault.connect(executor).executeAutomation(0);
      expect(dec("uint256", (await vault.getContext())[0])).to.equal(
        ethers.parseEther("50"),
      );

      await vault.connect(executor).executeAutomation(1);
      expect(await tokenB.balanceOf(await other.getAddress())).to.equal(
        ethers.parseEther("50"),
      );
    });

    it("context written in one tx is available in the next tx", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        tokenB,
        executor,
        recipient,
        other,
      } = await deployVaultFixture();

      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("100"));
      await tokenB.transfer(vaultAddress, ethers.parseEther("100"));
      await vault.setContext([enc("uint256", 0n)]);

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      const writeAction = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        ethers.parseEther("40"),
        NO_SLOT,
        0,
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), writeAction),
      ]);
      await vault.executeAutomation(0);

      const triggerB = encodeBalanceParams(
        await tokenB.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      const readAction = encodeTransferParams(
        await tokenB.getAddress(),
        await other.getAddress(),
        0n,
        0,
        NO_SLOT,
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerB, 1, DONE),
        actionStep(await action.getAddress(), readAction),
      ]);

      await vault.executeAutomation(1);
      expect(await tokenB.balanceOf(await other.getAddress())).to.equal(
        ethers.parseEther("40"),
      );
    });

    it("owner updates ctx slot between executions to change automation behaviour", async function () {
      const { vault, condition, action, tokenA, recipient } =
        await deployVaultFixture();

      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("200"));
      await vault.setContext([enc("uint256", ethers.parseEther("10"))]);

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      const actionData = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        0n,
        0,
        NO_SLOT,
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      await vault.executeAutomation(0);
      expect(await tokenA.balanceOf(recipient.address)).to.equal(
        ethers.parseEther("10"),
      );

      await vault.setContextSlot(0, enc("uint256", ethers.parseEther("50")));
      await vault.executeAutomation(0);
      expect(await tokenA.balanceOf(recipient.address)).to.equal(
        ethers.parseEther("60"),
      );
    });

    it("condition reads threshold from shared context slot", async function () {
      const { vault, condition, action, tokenA, recipient } =
        await deployVaultFixture();

      const vaultAddress = await vault.getAddress();
      const amount = ethers.parseEther("50");
      await tokenA.transfer(vaultAddress, amount);
      await vault.setContext([enc("uint256", ethers.parseEther("1"))]);

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        0n,
        true,
        0,
      );
      const actionData = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        amount,
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      await vault.executeAutomation(0);
      expect(await tokenA.balanceOf(recipient.address)).to.equal(amount);
    });
  });

  // ── isTriggerMet ────────────────────────────────────────────────────────

  describe("isTriggerMet", function () {
    it("returns false for non-existent automation", async function () {
      const { vault } = await deployVaultFixture();
      expect(await vault.isTriggerMet(99)).to.be.false;
    });

    it("returns true when trigger condition is met", async function () {
      const { vault, condition, tokenA, owner } = await deployVaultFixture();
      const data = encodeBalanceParams(
        await tokenA.getAddress(),
        await owner.getAddress(),
        1n,
        true,
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), data, DONE),
      ]);
      expect(await vault.isTriggerMet(0)).to.be.true;
    });

    it("returns false when trigger condition is not met", async function () {
      const { vault, condition, tokenA, executor } = await deployVaultFixture();
      const data = encodeBalanceParams(
        await tokenA.getAddress(),
        await executor.getAddress(),
        ethers.parseEther("9999999"),
        true,
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), data, DONE),
      ]);
      expect(await vault.isTriggerMet(0)).to.be.false;
    });
  });

  // ── updateAutomationSteps ───────────────────────────────────────────────

  describe("updateAutomationSteps", function () {
    it("replaces steps without touching shared context", async function () {
      const { vault, condition, action } = await deployVaultFixture();

      await vault.setContext([enc("uint256", 77n)]);
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), "0x", DONE),
      ]);

      await expect(
        vault.updateAutomationSteps(0, [
          conditionStep(await condition.getAddress(), "0x", 1, DONE),
          actionStep(await action.getAddress(), "0x"),
        ]),
      )
        .to.emit(vault, "AutomationStepsUpdated")
        .withArgs(0n, 2n);

      const [,, steps] = await vault.getAutomation(0);
      expect(steps.length).to.equal(2);
      expect(dec("uint256", (await vault.getContext())[0])).to.equal(77n);
    });
  });

  // ── Fee tracking ─────────────────────────────────────────────────────────

  describe("fee tracking", function () {
    async function deployWithFeeRegistry() {
      const [owner, executor, recipient, other] = await ethers.getSigners();

      const feeRegistry = await ethers.deployContract("FeeRegistry");

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy(
        "TokenA",
        "TKA",
        ethers.parseEther("1000000"),
      );
      const tokenB = await MockToken.deploy(
        "TokenB",
        "TKB",
        ethers.parseEther("1000000"),
      );

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      // depositToken = ZeroAddress — fee tracking only, no settlement
      await factory.setPriceOracle(await oracle.getAddress());
      await factory.createVault(
        owner.address,
        ethers.ZeroAddress,
        owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const action = await ethers.deployContract("ERC20TransferAction");

      return {
        vault,
        factory,
        condition,
        action,
        tokenA,
        tokenB,
        feeRegistry,
        oracle,
        owner,
        executor,
        recipient,
        other,
      };
    }

    it("emits FeeAccrued when action returns volumeUSD and registry has a fee set", async function () {
      const { vault, condition, action, tokenA, recipient, feeRegistry } =
        await deployWithFeeRegistry();

      const vaultAddress = await vault.getAddress();
      const amount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, amount);

      // 1 % fee on ERC20TransferAction.execute
      const actionAddress = await action.getAddress();
      await feeRegistry.setFee(actionAddress, EXECUTE_SEL, 100); // 100 bps = 1 %

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      const actionData = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        amount,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      const expectedVolumeUSD = amount; // amount * priceUSD / 1e18 = amount (price is 1:1)
      const expectedFeeUSD = expectedVolumeUSD / 100n; // 1 %

      await expect(vault.executeAutomation(0))
        .to.emit(vault, "FeeAccrued")
        .withArgs(
          0n,
          1n,
          actionAddress,
          EXECUTE_SEL,
          expectedVolumeUSD,
          expectedFeeUSD,
        );
    });

    it("does not emit FeeAccrued when no oracle is configured for the vault", async function () {
      // Deploy vault without an oracle — vault cannot convert token amount to USD
      const [owner, , recipient] = await ethers.getSigners();
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy("TokenA", "TKA", ethers.parseEther("1000000"));
      // no oracle → priceOracle_ = ZeroAddress
      await factory.createVault(owner.address, ethers.ZeroAddress, owner.address, ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));
      const condition = await ethers.deployContract("TokenBalanceCondition");
      const action = await ethers.deployContract("ERC20TransferAction");

      const vaultAddress = await vault.getAddress();
      const amount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, amount);
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100);

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      // no oracle configured → volumeUSD = 0 → no FeeAccrued
      const actionData = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        amount,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      const tx = await vault.executeAutomation(0);
      const receipt = await tx.wait();
      const feeEvents = receipt?.logs.filter(
        (l) => l.topics[0] === vault.interface.getEvent("FeeAccrued").topicHash,
      );
      expect(feeEvents?.length).to.equal(0);
    });

    it("does not emit FeeAccrued when no registry is set", async function () {
      const { vault, condition, action, tokenA, recipient } =
        await deployVaultFixture();

      const vaultAddress = await vault.getAddress();
      const amount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, amount);

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      const actionData = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        amount,
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      const tx = await vault.executeAutomation(0);
      const receipt = await tx.wait();
      const feeEvents = receipt?.logs.filter(
        (l) => l.topics[0] === vault.interface.getEvent("FeeAccrued").topicHash,
      );
      expect(feeEvents?.length).to.equal(0);
    });
  });

  // ── Fee settlement ───────────────────────────────────────────────────────

  describe("fee settlement", function () {
    /**
     * Full fee-settlement fixture.
     *
     * Key design: fee tokens are held in FeeRegistry (not in the vault).
     * This protects them from being swept by automation actions.
     *
     * Setup:
     *  - depositToken: MockERC20 with 18 decimals
     *  - FeeRegistry: accepts depositToken, 50/20/20/10 split, 1 % on execute
     *  - Vault: created with depositToken + creator (owner) fixed at init
     *  - 1 000 fee tokens pre-deposited into FeeRegistry on behalf of vault
     */
    async function deployWithFeeSettlementFixture() {
      const [owner, executor, recipient, other, protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy(
        "TokenA",
        "TKA",
        ethers.parseEther("1000000"),
      );
      const tokenB = await MockToken.deploy(
        "TokenB",
        "TKB",
        ethers.parseEther("1000000"),
      );
      const depositToken = await MockToken.deploy(
        "FeeToken",
        "FEE",
        ethers.parseEther("1000000"),
      );

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address, // protocolVault — 50 %
        burnWallet.address, // burnContract  — 10 %
        5000, // protocolBps
        2000, // executorBps
        2000, // creatorBps
        1000, // burnBps
      );

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const action = await ethers.deployContract("ERC20TransferAction");
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100); // 1 %

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      // depositToken and creator (owner) are fixed at vault creation — immutable.
      await factory.setPriceOracle(await oracle.getAddress());
      await factory.createVault(
        owner.address,
        await depositToken.getAddress(),
        owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );

      // Pre-deposit fee tokens INTO FeeRegistry (safe from automation actions).
      const vaultAddress = await vault.getAddress();
      await depositToken.approve(
        await feeRegistry.getAddress(),
        ethers.parseEther("1000"),
      );
      await feeRegistry.depositFor(
        vaultAddress,
        await depositToken.getAddress(),
        ethers.parseEther("1000"),
      );

      return {
        vault,
        factory,
        condition,
        action,
        tokenA,
        tokenB,
        feeRegistry,
        depositToken,
        oracle,
        owner,
        executor,
        recipient,
        other,
        protocolWallet,
        burnWallet,
      };
    }

    it("creator is set to the address provided at initialization", async function () {
      const { vault, owner } = await deployWithFeeSettlementFixture();
      expect(await vault.creator()).to.equal(owner.address);
    });

    it("depositToken is set to the address provided at initialization", async function () {
      const { vault, depositToken } = await deployWithFeeSettlementFixture();
      expect(await vault.depositToken()).to.equal(await depositToken.getAddress());
    });

    it("fee deposit is held in FeeRegistry, not in vault", async function () {
      const { vault, feeRegistry, depositToken } =
        await deployWithFeeSettlementFixture();
      const vaultAddress = await vault.getAddress();
      const registryAddress = await feeRegistry.getAddress();

      // Vault itself holds no fee tokens
      expect(await depositToken.balanceOf(vaultAddress)).to.equal(0n);
      // FeeRegistry holds the deposit on behalf of the vault
      expect(
        await feeRegistry.vaultDeposit(
          vaultAddress,
          await depositToken.getAddress(),
        ),
      ).to.equal(ethers.parseEther("1000"));
      // Total FeeRegistry balance equals the deposit
      expect(await depositToken.balanceOf(registryAddress)).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("emits FeesSettled and distributes claimable shares correctly", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        executor,
        recipient,
        feeRegistry,
        depositToken,
        protocolWallet,
        burnWallet,
        owner,
      } = await deployWithFeeSettlementFixture();

      const vaultAddress = await vault.getAddress();
      const amount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, amount);

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            amount,
          ),
        ),
      ]);

      // volumeUSD = 100e18, feeUSD = 1e18 (1 %), depositTokenAmount = 1e18 (18-dec token)
      const feeUSD = ethers.parseEther("1");
      const feeAmount = ethers.parseEther("1");
      const feeAddr = await depositToken.getAddress();

      await expect(vault.connect(executor).executeAutomation(0))
        .to.emit(vault, "FeesSettled")
        .withArgs(
          0n,
          executor.address,
          feeAddr,
          owner.address,
          feeUSD,
          feeAmount,
          0n,
        ); // gasCompTokens=0 (gas config not set)

      // 50 % → protocolVault  (claimable in registry)
      expect(
        await feeRegistry.claimable(protocolWallet.address, feeAddr),
      ).to.equal(ethers.parseEther("0.5"));
      // 20 % → executor
      expect(await feeRegistry.claimable(executor.address, feeAddr)).to.equal(
        ethers.parseEther("0.2"),
      );
      // 20 % → creator (defaults to vault owner)
      expect(await feeRegistry.claimable(owner.address, feeAddr)).to.equal(
        ethers.parseEther("0.2"),
      );
      // 10 % → burn contract (direct transfer out of registry)
      expect(await depositToken.balanceOf(burnWallet.address)).to.equal(
        ethers.parseEther("0.1"),
      );
    });

    it("parties can claim their accumulated fees", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        executor,
        recipient,
        feeRegistry,
        depositToken,
        protocolWallet,
        owner,
      } = await deployWithFeeSettlementFixture();

      const vaultAddress = await vault.getAddress();
      const feeAddr = await depositToken.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("100"));

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("100"),
          ),
        ),
      ]);
      await vault.connect(executor).executeAutomation(0);

      // Protocol claims
      const protoBalBefore = await depositToken.balanceOf(protocolWallet.address);
      await feeRegistry.connect(protocolWallet).claim(feeAddr);
      expect(await depositToken.balanceOf(protocolWallet.address)).to.equal(
        protoBalBefore + ethers.parseEther("0.5"),
      );
      expect(
        await feeRegistry.claimable(protocolWallet.address, feeAddr),
      ).to.equal(0n);

      // Creator claims
      const ownerBalBefore = await depositToken.balanceOf(owner.address);
      await feeRegistry.connect(owner).claim(feeAddr);
      expect(await depositToken.balanceOf(owner.address)).to.equal(
        ownerBalBefore + ethers.parseEther("0.2"),
      );
    });

    it("reverts with NothingToClaim when caller has no fees", async function () {
      const { feeRegistry, depositToken, other } =
        await deployWithFeeSettlementFixture();
      await expect(
        feeRegistry.connect(other).claim(await depositToken.getAddress()),
      ).to.be.revertedWithCustomError(feeRegistry, "NothingToClaim");
    });

    it("reverts with InsufficientFeeDeposit when deposit runs out", async function () {
      const [owner, executor, recipient, , protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy(
        "TokenA",
        "TKA",
        ethers.parseEther("1000000"),
      );
      const depositToken = await MockToken.deploy(
        "FeeToken",
        "FEE",
        ethers.parseEther("1000000"),
      );
      const feeAddr = await depositToken.getAddress();
      const action = await ethers.deployContract("ERC20TransferAction");
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(feeAddr, 18);
      await feeRegistry.setDistribution(
        protocolWallet.address,
        burnWallet.address,
        5000,
        2000,
        2000,
        1000,
      );
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100);

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());
      await factory.createVault(
        owner.address,
        feeAddr,
        owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );

      // Deposit only 0.5 tokens — not enough for 1 token fee
      const condition = await ethers.deployContract("TokenBalanceCondition");
      const vaultAddress = await vault.getAddress();
      await depositToken.approve(
        await feeRegistry.getAddress(),
        ethers.parseEther("0.5"),
      );
      await feeRegistry.depositFor(
        vaultAddress,
        feeAddr,
        ethers.parseEther("0.5"),
      );

      await tokenA.transfer(vaultAddress, ethers.parseEther("100"));
      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("100"),
          ),
        ),
      ]);

      await expect(
        vault.connect(executor).executeAutomation(0),
      ).to.be.revertedWithCustomError(feeRegistry, "InsufficientFeeDeposit");
    });

    it("depositFees moves tokens from vault balance into FeeRegistry", async function () {
      const [owner, , , , protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const depositToken = await MockToken.deploy(
        "FeeToken",
        "FEE",
        ethers.parseEther("1000000"),
      );
      const feeAddr = await depositToken.getAddress();
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(feeAddr, 18);
      await feeRegistry.setDistribution(
        protocolWallet.address,
        burnWallet.address,
        5000,
        2000,
        2000,
        1000,
      );

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.createVault(
        owner.address,
        feeAddr,
        owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );

      // Fund vault directly (simulates tokens received via automation)
      const vaultAddress = await vault.getAddress();
      await depositToken.transfer(vaultAddress, ethers.parseEther("500"));

      // Vault moves tokens from its balance into FeeRegistry via depositFees
      await vault.connect(owner).depositFees(feeAddr, ethers.parseEther("200"));

      expect(await depositToken.balanceOf(vaultAddress)).to.equal(
        ethers.parseEther("300"),
      );
      expect(await feeRegistry.vaultDeposit(vaultAddress, feeAddr)).to.equal(
        ethers.parseEther("200"),
      );
    });

    it("creator share goes to creator address set at initialization", async function () {
      // Create a vault where creator = other (not owner) from the start.
      const [owner, executor, recipient, other, protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy(
        "TokenA",
        "TKA",
        ethers.parseEther("1000000"),
      );
      const depositToken = await MockToken.deploy(
        "FeeToken",
        "FEE",
        ethers.parseEther("1000000"),
      );
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address,
        burnWallet.address,
        5000,
        2000,
        2000,
        1000,
      );
      const action = await ethers.deployContract("ERC20TransferAction");
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100);

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      // creator = other.address — fixed at creation
      await factory.setPriceOracle(await oracle.getAddress());
      await factory.createVault(
        owner.address,
        await depositToken.getAddress(),
        other.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );
      expect(await vault.creator()).to.equal(other.address);

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const vaultAddress = await vault.getAddress();
      await depositToken.approve(
        await feeRegistry.getAddress(),
        ethers.parseEther("1000"),
      );
      await feeRegistry.depositFor(
        vaultAddress,
        await depositToken.getAddress(),
        ethers.parseEther("1000"),
      );
      await tokenA.transfer(vaultAddress, ethers.parseEther("100"));

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("100"),
          ),
        ),
      ]);
      await vault.connect(executor).executeAutomation(0);

      expect(
        await feeRegistry.claimable(other.address, await depositToken.getAddress()),
      ).to.equal(ethers.parseEther("0.2"));
    });

    it("skips settlement silently when depositToken is not set (address(0) at init)", async function () {
      const [owner, executor, recipient] = await ethers.getSigners();

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      const action = await ethers.deployContract("ERC20TransferAction");
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100);

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy(
        "TokenA",
        "TKA",
        ethers.parseEther("1000000"),
      );

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      // depositToken = ZeroAddress → _settleFees silently skips
      await factory.createVault(
        owner.address,
        ethers.ZeroAddress,
        owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("100"));
      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("100"),
          ),
        ),
      ]);

      const tx = await vault.connect(executor).executeAutomation(0);
      const receipt = await tx.wait();
      const settled = receipt?.logs.filter(
        (l) =>
          l.topics[0] === vault.interface.getEvent("FeesSettled").topicHash,
      );
      expect(settled?.length).to.equal(0);
    });

    it("fees accumulate over multiple executions before claim", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        executor,
        recipient,
        feeRegistry,
        depositToken,
        owner,
      } = await deployWithFeeSettlementFixture();

      const vaultAddress = await vault.getAddress();
      const amount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, amount * 2n);

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            amount,
          ),
        ),
      ]);

      await vault.connect(executor).executeAutomation(0);
      await vault.connect(executor).executeAutomation(0);

      // 2 × 20 % × 1e18 = 0.4e18 for creator (vault owner)
      expect(
        await feeRegistry.claimable(owner.address, await depositToken.getAddress()),
      ).to.equal(ethers.parseEther("0.4"));
    });

    it("FeeRegistry supports multiple accepted tokens — two vaults, each paying a different token", async function () {
      // Since depositToken is immutable per vault, two separate vaults use different fee tokens.
      // This verifies that FeeRegistry tracks deposits and claimable independently per token.
      const [ownerA, ownerB, executor, recipient, protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy(
        "TokenA",
        "TKA",
        ethers.parseEther("1000000"),
      );
      const depositTokenA = await MockToken.deploy(
        "FeeA",
        "FEEA",
        ethers.parseEther("1000000"),
      );
      const depositTokenB = await MockToken.deploy(
        "FeeB",
        "FEEB",
        ethers.parseEther("1000000"),
      );
      const addrA = await depositTokenA.getAddress();
      const addrB = await depositTokenB.getAddress();

      const action = await ethers.deployContract("ERC20TransferAction");
      const condition = await ethers.deployContract("TokenBalanceCondition");
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(addrA, 18);
      await feeRegistry.addAcceptedToken(addrB, 18);
      await feeRegistry.setDistribution(
        protocolWallet.address,
        burnWallet.address,
        5000,
        2000,
        2000,
        1000,
      );
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100);

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());

      // vaultA pays in depositTokenA, vaultB pays in depositTokenB
      await factory.setPriceOracle(await oracle.getAddress());
      await factory
        .connect(ownerA)
        .createVault(ownerA.address, addrA, ownerA.address, ethers.ZeroHash);
      await factory
        .connect(ownerB)
        .createVault(ownerB.address, addrB, ownerB.address, ethers.ZeroHash);
      const vaultA = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );
      const vaultB = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(1),
      );

      const registryAddr = await feeRegistry.getAddress();
      const addrVaultA = await vaultA.getAddress();
      const addrVaultB = await vaultB.getAddress();

      await depositTokenA.approve(registryAddr, ethers.parseEther("1000"));
      await feeRegistry.depositFor(
        addrVaultA,
        addrA,
        ethers.parseEther("1000"),
      );
      await depositTokenB.approve(registryAddr, ethers.parseEther("1000"));
      await feeRegistry.depositFor(
        addrVaultB,
        addrB,
        ethers.parseEther("1000"),
      );

      // Both vaults execute the same automation (transfer + fee accrual)
      for (const [vault, vaultAddr, vaultOwner] of [
        [vaultA, addrVaultA, ownerA],
        [vaultB, addrVaultB, ownerB],
      ] as const) {
        await tokenA.transfer(vaultAddr, ethers.parseEther("100"));
        await vault
          .connect(vaultOwner)
          .createAutomation([
            conditionStep(
              await condition.getAddress(),
              encodeBalanceParams(
                await tokenA.getAddress(),
                vaultAddr,
                1n,
                true,
              ),
              1,
            ),
            actionStep(
              await action.getAddress(),
              encodeTransferParams(
                await tokenA.getAddress(),
                await recipient.getAddress(),
                ethers.parseEther("100"),
              ),
            ),
          ]);
        await vault.connect(executor).executeAutomation(0);
      }

      // Claimable per creator per token is independent
      expect(await feeRegistry.claimable(ownerA.address, addrA)).to.equal(
        ethers.parseEther("0.2"),
      );
      expect(await feeRegistry.claimable(ownerB.address, addrB)).to.equal(
        ethers.parseEther("0.2"),
      );
      // No cross-token bleed
      expect(await feeRegistry.claimable(ownerA.address, addrB)).to.equal(0n);
      expect(await feeRegistry.claimable(ownerB.address, addrA)).to.equal(0n);

      // Claiming token A for ownerA does not affect token B claimable for ownerB
      const balABefore = await depositTokenA.balanceOf(ownerA.address);
      await feeRegistry.connect(ownerA).claim(addrA);
      expect(await depositTokenA.balanceOf(ownerA.address)).to.equal(
        balABefore + ethers.parseEther("0.2"),
      );
      expect(await feeRegistry.claimable(ownerA.address, addrA)).to.equal(0n);
      expect(await feeRegistry.claimable(ownerB.address, addrB)).to.equal(
        ethers.parseEther("0.2"),
      );
    });
  });

  // ── Deposit token price awareness ─────────────────────────────────────────

  describe("deposit token price in fee calculation", function () {
    it("uses oracle price of deposit token to convert USD fee to tokens", async function () {
      // Setup: depositToken priced at $2 (not $1).
      // A $1 USD fee should cost 0.5 depositTokens, not 1.
      const [owner, executor, protocolWallet, burnWallet] = await ethers.getSigners();

      const MockToken   = await ethers.getContractFactory("MockERC20");
      const depositToken = await MockToken.deploy("DEP", "DEP", ethers.parseEther("1000000"));
      const tokenA      = await MockToken.deploy("TKA", "TKA", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address, burnWallet.address, 5000, 2000, 2000, 1000,
      );

      const oracle = await ethers.deployContract("MockPriceOracle");
      // tokenA priced at $1, depositToken priced at $2
      await oracle.setPrice(await tokenA.getAddress(),       ethers.parseEther("1"));
      await oracle.setPrice(await depositToken.getAddress(), ethers.parseEther("2"));
      // Configure FeeRegistry oracle (used for _feeTokenAmount)
      await feeRegistry.setGasConfig(
        await oracle.getAddress(), ethers.ZeroAddress, 0, 0, 0,
      );

      const action    = await ethers.deployContract("ERC20TransferAction");
      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());

      // 1 % fee on ERC20TransferAction
      await feeRegistry.setFee(
        await action.getAddress(),
        id("execute(bytes,bytes[])").slice(0, 10),
        100,
      );

      const vaultAddress = await factory.createVault.staticCall(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      await factory.createVault(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      const vault     = await ethers.getContractAt("StrategyBuilderVault", vaultAddress);
      const condition = await ethers.deployContract("TokenBalanceCondition");

      // Transfer 100 tokenA to vault for the action to transfer
      const transferAmount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, transferAmount);

      // Pre-fund fee deposit
      await depositToken.approve(await feeRegistry.getAddress(), ethers.parseEther("100"));
      await feeRegistry.depositFor(vaultAddress, await depositToken.getAddress(), ethers.parseEther("100"));

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), vaultAddress, 1n, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), executor.address, transferAmount),
        ),
      ]);

      const depositBefore = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      await vault.connect(executor).executeAutomation(0);

      const depositAfter = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      // volumeUSD = 100 tokenA * $1 = $100
      // feeUSD    = $100 * 1% = $1  (= 1e18)
      // depositToken price = $2 → feeTokens = $1 / $2 = 0.5 tokens (= 0.5e18)
      const deducted = depositBefore - depositAfter;
      expect(deducted).to.equal(ethers.parseEther("0.5"));
    });

    it("falls back to 1:1 USD assumption when deposit token has no oracle price", async function () {
      const [owner, executor, protocolWallet, burnWallet] = await ethers.getSigners();

      const MockToken    = await ethers.getContractFactory("MockERC20");
      const depositToken = await MockToken.deploy("DEP", "DEP", ethers.parseEther("1000000"));
      const tokenA       = await MockToken.deploy("TKA", "TKA", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address, burnWallet.address, 5000, 2000, 2000, 1000,
      );

      const oracle = await ethers.deployContract("MockPriceOracle");
      // Only tokenA has a price — depositToken has none (oracle reverts OracleNotExist)
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));
      await feeRegistry.setGasConfig(
        await oracle.getAddress(), ethers.ZeroAddress, 0, 0, 0,
      );

      const action    = await ethers.deployContract("ERC20TransferAction");
      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());

      await feeRegistry.setFee(
        await action.getAddress(),
        id("execute(bytes,bytes[])").slice(0, 10),
        100,
      );

      const vaultAddress = await factory.createVault.staticCall(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      await factory.createVault(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      const vault     = await ethers.getContractAt("StrategyBuilderVault", vaultAddress);
      const condition = await ethers.deployContract("TokenBalanceCondition");

      const transferAmount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, transferAmount);
      await depositToken.approve(await feeRegistry.getAddress(), ethers.parseEther("100"));
      await feeRegistry.depositFor(vaultAddress, await depositToken.getAddress(), ethers.parseEther("100"));

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), vaultAddress, 1n, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), executor.address, transferAmount),
        ),
      ]);

      const depositBefore = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      await vault.connect(executor).executeAutomation(0);

      const depositAfter = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      // No oracle price for depositToken → fallback: 1 token (18 dec) = $1
      // feeUSD = $1 → deducted = 1e18 tokens
      const deducted = depositBefore - depositAfter;
      expect(deducted).to.equal(ethers.parseEther("1"));
    });
  });

  // ── Fee reduction ────────────────────────────────────────────────────────

  describe("fee reduction", function () {
    /**
     * Full fixture: registry + vault + oracle + MockFeeReduction configured.
     * tokenA price = $1, fee = 1 %, distribution = 50/20/20/10.
     * Owner gets 50 % fee reduction → pays only 50 % of volume fee.
     */
    async function deployWithFeeReductionFixture() {
      const [owner, executor, recipient, other, protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy("TokenA", "TKA", ethers.parseEther("1000000"));
      const depositToken = await MockToken.deploy("FeeToken", "FEE", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address, burnWallet.address,
        5000, 2000, 2000, 1000,
      );

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const action    = await ethers.deployContract("ERC20TransferAction");
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100); // 1 %

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      const feeReduction = await ethers.deployContract("MockFeeReduction");

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());
      await factory.createVault(
        owner.address,
        await depositToken.getAddress(),
        owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));
      const vaultAddress = await vault.getAddress();

      // Pre-deposit fee tokens
      await depositToken.approve(await feeRegistry.getAddress(), ethers.parseEther("1000"));
      await feeRegistry.depositFor(vaultAddress, await depositToken.getAddress(), ethers.parseEther("1000"));

      // Wire fee reduction
      await feeRegistry.setFeeReductionConfig(
        await feeReduction.getAddress(),
        await factory.getAddress(),
      );

      return {
        vault, factory, condition, action,
        tokenA, depositToken, feeRegistry, oracle, feeReduction,
        owner, executor, recipient, other, protocolWallet, burnWallet,
      };
    }

    it("setFeeReductionConfig stores addresses and emits event", async function () {
      const feeRegistry  = await ethers.deployContract("FeeRegistry");
      const feeReduction = await ethers.deployContract("MockFeeReduction");
      const factory      = await ethers.deployContract("StrategyBuilderVaultFactory");

      await expect(
        feeRegistry.setFeeReductionConfig(
          await feeReduction.getAddress(),
          await factory.getAddress(),
        ),
      )
        .to.emit(feeRegistry, "FeeReductionConfigSet")
        .withArgs(await feeReduction.getAddress(), await factory.getAddress());

      expect(await feeRegistry.feeReduction()).to.equal(await feeReduction.getAddress());
      expect(await feeRegistry.trustedFactory()).to.equal(await factory.getAddress());
    });

    it("only owner can call setFeeReductionConfig", async function () {
      const [, other] = await ethers.getSigners();
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await expect(
        feeRegistry.connect(other).setFeeReductionConfig(ethers.ZeroAddress, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(feeRegistry, "OwnableUnauthorizedAccount");
    });

    it("factory.isRegisteredVault returns true for created vaults", async function () {
      const [deployer, alice] = await ethers.getSigners();
      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());

      expect(await factory.isRegisteredVault(alice.address)).to.equal(false);

      await factory.createVault(alice.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroHash);
      const vaultAddr = await factory.getVault(0);
      expect(await factory.isRegisteredVault(vaultAddr)).to.equal(true);
      // deployer is not a vault
      expect(await factory.isRegisteredVault(deployer.address)).to.equal(false);
    });

    it("applies 50 % reduction: vault pays half the volume fee", async function () {
      const {
        vault, condition, action, tokenA, depositToken, feeRegistry, feeReduction,
        owner, executor, recipient, protocolWallet,
      } = await deployWithFeeReductionFixture();

      // 50 % reduction for the vault owner
      await feeReduction.setFeeReduction(owner.address, 5000);

      const amount = ethers.parseEther("100");
      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, amount);

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), vaultAddress, 1n, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), await recipient.getAddress(), amount),
        ),
      ]);

      // volumeUSD = 100e18 (price $1, amount 100 tokens)
      // fullFee   = 1 % of 100e18 = 1e18
      // after 50 % reduction = 0.5e18 depositTokens
      const depositBefore = await feeRegistry.vaultDeposit(vaultAddress, await depositToken.getAddress());
      await vault.connect(executor).executeAutomation(0);
      const depositAfter = await feeRegistry.vaultDeposit(vaultAddress, await depositToken.getAddress());

      const deducted = depositBefore - depositAfter;
      // Should be 0.5e18, not 1e18
      expect(deducted).to.equal(ethers.parseEther("0.5"));
    });

    it("100 % reduction: only gas comp is deducted (volume fee is zero)", async function () {
      const {
        vault, condition, action, tokenA, depositToken, feeRegistry, feeReduction,
        owner, executor, recipient,
      } = await deployWithFeeReductionFixture();

      await feeReduction.setFeeReduction(owner.address, 10_000); // 100 %

      const amount = ethers.parseEther("100");
      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, amount);

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), vaultAddress, 1n, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), await recipient.getAddress(), amount),
        ),
      ]);

      const depositBefore = await feeRegistry.vaultDeposit(vaultAddress, await depositToken.getAddress());
      await vault.connect(executor).executeAutomation(0);
      const depositAfter = await feeRegistry.vaultDeposit(vaultAddress, await depositToken.getAddress());

      // No gas config → gasCompTokens = 0 → totalTokens = max(0, 0) = 0 → nothing deducted
      expect(depositBefore - depositAfter).to.equal(0n);
    });

    it("gas compensation is never reduced", async function () {
      const [owner, executor, recipient, other, protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA   = await MockToken.deploy("TokenA", "TKA", ethers.parseEther("1000000"));
      const depositToken = await MockToken.deploy("FeeToken", "FEE", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address, burnWallet.address, 5000, 2000, 2000, 1000,
      );
      const condition = await ethers.deployContract("TokenBalanceCondition");
      const action    = await ethers.deployContract("ERC20TransferAction");
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100);

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));
      await oracle.setPrice(ethers.ZeroAddress, ethers.parseEther("3000"));
      // gas config: native $3000, 0 % markup
      await feeRegistry.setGasConfig(await oracle.getAddress(), ethers.ZeroAddress, 0, 0, 0);

      const feeReduction = await ethers.deployContract("MockFeeReduction");

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());
      await factory.createVault(
        owner.address, await depositToken.getAddress(), owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));
      const vaultAddress = await vault.getAddress();

      await depositToken.approve(await feeRegistry.getAddress(), ethers.parseEther("1000"));
      await feeRegistry.depositFor(vaultAddress, await depositToken.getAddress(), ethers.parseEther("1000"));

      // 100 % reduction on volume fee
      await feeReduction.setFeeReduction(owner.address, 10_000);
      await feeRegistry.setFeeReductionConfig(
        await feeReduction.getAddress(),
        await factory.getAddress(),
      );

      const amount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, amount);
      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), vaultAddress, 1n, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), await recipient.getAddress(), amount),
        ),
      ]);

      const depositBefore = await feeRegistry.vaultDeposit(vaultAddress, await depositToken.getAddress());
      const tx = await vault.connect(executor).executeAutomation(0);
      const receipt = await tx.wait();
      const depositAfter = await feeRegistry.vaultDeposit(vaultAddress, await depositToken.getAddress());

      const deducted = depositBefore - depositAfter;
      // Volume fee is fully reduced to 0; only gas comp is deducted.
      // gasCompTokens > 0 (gas oracle is active) — we just verify it equals gasCompTokens.
      const iface = feeRegistry.interface;
      const feeDeductedLog = receipt!.logs
        .map((l) => { try { return iface.parseLog(l); } catch { return null; } })
        .find((e) => e?.name === "FeeDeducted");

      expect(feeDeductedLog).to.not.be.undefined;
      const gasCompTokens: bigint = feeDeductedLog!.args.gasCompTokens;
      expect(gasCompTokens).to.be.gt(0n);
      // All deducted tokens are gas comp (volume fee = 0 after 100 % reduction)
      expect(deducted).to.equal(gasCompTokens);
    });

    it("unregistered caller does not receive fee reduction", async function () {
      // Deploy FeeRegistry with a fee reduction configured but call deductFees
      // from an address that is NOT registered in the factory.
      const [owner, executor, protocolWallet, burnWallet] = await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const depositToken  = await MockToken.deploy("FeeToken", "FEE", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address, burnWallet.address, 5000, 2000, 2000, 1000,
      );

      const feeReduction = await ethers.deployContract("MockFeeReduction");
      const factory      = await ethers.deployContract("StrategyBuilderVaultFactory");
      // Give the owner a 100 % reduction
      await feeReduction.setFeeReduction(owner.address, 10_000);
      await feeRegistry.setFeeReductionConfig(
        await feeReduction.getAddress(),
        await factory.getAddress(),
      );

      // Deposit directly for owner's EOA (not a registered vault)
      const feeAddr = await depositToken.getAddress();
      await depositToken.approve(await feeRegistry.getAddress(), ethers.parseEther("100"));
      await feeRegistry.depositFor(owner.address, feeAddr, ethers.parseEther("100"));

      // Call deductFees directly from owner (EOA, not in factory registry)
      // feeUSD = 1e18, gasUsed = 0 → no gas comp
      // Without reduction applied: deducted = 1e18
      const balBefore = await feeRegistry.vaultDeposit(owner.address, feeAddr);
      // Must set distribution first — call deductFees from owner
      // We need owner to call deductFees; use a low-level approach via the registry
      // directly (owner is msg.sender)
      await feeRegistry.connect(owner).deductFees(
        feeAddr, executor.address, owner.address, ethers.parseEther("1"), 0,
      );
      const balAfter = await feeRegistry.vaultDeposit(owner.address, feeAddr);
      const deducted = balBefore - balAfter;

      // Reduction is NOT applied because owner is not a registered vault → full 1e18 deducted
      expect(deducted).to.equal(ethers.parseEther("1"));
    });

    it("no reduction when feeReduction is address(0)", async function () {
      const { vault, condition, action, tokenA, depositToken, feeRegistry, owner, executor, recipient } =
        await deployWithFeeReductionFixture();

      // Clear the fee reduction config
      await feeRegistry.setFeeReductionConfig(ethers.ZeroAddress, ethers.ZeroAddress);

      const amount = ethers.parseEther("100");
      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, amount);

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), vaultAddress, 1n, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), await recipient.getAddress(), amount),
        ),
      ]);

      const depositBefore = await feeRegistry.vaultDeposit(vaultAddress, await depositToken.getAddress());
      await vault.connect(executor).executeAutomation(0);
      const depositAfter = await feeRegistry.vaultDeposit(vaultAddress, await depositToken.getAddress());

      // Full 1 % fee = 1e18 (no reduction)
      expect(depositBefore - depositAfter).to.equal(ethers.parseEther("1"));
    });
  });

  // ── IntervalCondition ────────────────────────────────────────────────────

  describe("IntervalCondition", function () {
    const INTERVAL = 300n; // 5 minutes
    const TIME_SLOT = 0;

    async function deployIntervalFixture() {
      const [owner, executor] = await ethers.getSigners();

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.createVault(
        owner.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

      const condition = await ethers.deployContract("IntervalCondition");

      return { vault, condition, owner, executor };
    }

    it("check returns false when context slot is empty (not initialised)", async function () {
      const { condition } = await deployIntervalFixture();
      // ctx with one empty slot
      const ctx = ["0x"];
      const params = encodeIntervalParams(INTERVAL, TIME_SLOT);
      // Call check directly — it's a view function
      const met = await condition.check(params, ctx);
      expect(met).to.equal(false);
    });

    it("check returns false when nextTime is 0", async function () {
      const { condition } = await deployIntervalFixture();
      const ctx = [abiCoder.encode(["uint256"], [0n])];
      const met = await condition.check(encodeIntervalParams(INTERVAL, TIME_SLOT), ctx);
      expect(met).to.equal(false);
    });

    it("check returns false before startTime", async function () {
      const { condition } = await deployIntervalFixture();
      const latest = await ethers.provider.getBlock("latest");
      const futureTime = BigInt(latest!.timestamp) + 3600n; // 1 h in the future
      const ctx = [abiCoder.encode(["uint256"], [futureTime])];
      const met = await condition.check(encodeIntervalParams(INTERVAL, TIME_SLOT), ctx);
      expect(met).to.equal(false);
    });

    it("check returns true after startTime has passed", async function () {
      const { condition } = await deployIntervalFixture();
      const latest = await ethers.provider.getBlock("latest");
      const pastTime = BigInt(latest!.timestamp) - 1n;
      const ctx = [abiCoder.encode(["uint256"], [pastTime])];
      const met = await condition.check(encodeIntervalParams(INTERVAL, TIME_SLOT), ctx);
      expect(met).to.equal(true);
    });

    it("afterExecution advances nextTime by interval (drift-free)", async function () {
      const { condition } = await deployIntervalFixture();
      const latest = await ethers.provider.getBlock("latest");
      const startTime = BigInt(latest!.timestamp) - 10n;
      const ctx = [abiCoder.encode(["uint256"], [startTime])];
      const params = encodeIntervalParams(INTERVAL, TIME_SLOT);

      const [slots, values] = await condition.afterExecution(params, ctx);
      expect(slots.length).to.equal(1);
      expect(slots[0]).to.equal(TIME_SLOT);
      const newNextTime: bigint = abiCoder.decode(["uint256"], values[0])[0] as bigint;
      // drift-free: startTime + interval, NOT block.timestamp + interval
      expect(newNextTime).to.equal(startTime + INTERVAL);
    });

    it("full automation: condition fires, interval advances, condition blocks until next window", async function () {
      const { vault, condition, owner, executor } = await deployIntervalFixture();

      const latest = await ethers.provider.getBlock("latest");
      const startTime = BigInt(latest!.timestamp);

      // Init context: slot 0 = startTime
      await vault.connect(owner).setContext([abiCoder.encode(["uint256"], [startTime])]);

      const params = encodeIntervalParams(INTERVAL, TIME_SLOT);
      await vault.connect(owner).createAutomation([
        conditionStep(await condition.getAddress(), params, DONE, DONE, CHECK_SEL),
      ]);

      // Execute immediately — startTime == now → condition is true
      await vault.connect(executor).executeAutomation(0);

      // afterExecution should have advanced ctx[0] to startTime + INTERVAL
      const ctxAfter = await vault.getContext();
      const nextTime: bigint = abiCoder.decode(["uint256"], ctxAfter[0])[0] as bigint;
      expect(nextTime).to.equal(startTime + INTERVAL);

      // Execute again immediately — block.timestamp < nextTime → condition is false → revert
      await expect(vault.connect(executor).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "TriggerNotMet");
      // ctx must be unchanged — trigger did NOT fire
      const ctxUnchanged = await vault.getContext();
      const nextTimeUnchanged: bigint = abiCoder.decode(["uint256"], ctxUnchanged[0])[0] as bigint;
      expect(nextTimeUnchanged).to.equal(nextTime);

      // Advance chain time past the interval
      await ethers.provider.send("evm_increaseTime", [Number(INTERVAL)]);
      await ethers.provider.send("evm_mine", []);

      // Now execute again — condition fires, interval advances again
      await vault.connect(executor).executeAutomation(0);
      const ctxFinal = await vault.getContext();
      const nextTimeFinal: bigint = abiCoder.decode(["uint256"], ctxFinal[0])[0] as bigint;
      expect(nextTimeFinal).to.equal(startTime + INTERVAL * 2n);
    });

    it("non-updatable trigger condition: context unchanged after execution", async function () {
      const { vault, owner, executor } = await deployIntervalFixture();
      // Use TokenBalanceCondition (does NOT implement afterExecution) — ctx should stay intact
      const condition = await ethers.deployContract("TokenBalanceCondition");
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("T", "T", ethers.parseEther("1000"));
      const vaultAddress = await vault.getAddress();
      await token.transfer(vaultAddress, ethers.parseEther("1"));

      // sentinel value in slot 0
      const sentinel = 9999999999n;
      await vault.connect(owner).setContext([abiCoder.encode(["uint256"], [sentinel])]);

      const triggerData = encodeBalanceParams(await token.getAddress(), vaultAddress, 1n, true);
      await vault.connect(owner).createAutomation([
        conditionStep(await condition.getAddress(), triggerData, DONE, DONE, CHECK_SEL),
      ]);
      await vault.connect(executor).executeAutomation(0);

      // ctx[0] must still be the sentinel — no update happened
      const ctxAfter = await vault.getContext();
      const val: bigint = abiCoder.decode(["uint256"], ctxAfter[0])[0] as bigint;
      expect(val).to.equal(sentinel);
    });

    it("reverts with ZeroInterval when interval is 0 in afterExecution", async function () {
      const { condition } = await deployIntervalFixture();
      const ctx = [abiCoder.encode(["uint256"], [1000000n])];
      await expect(
        condition.afterExecution(encodeIntervalParams(0n, TIME_SLOT), ctx),
      ).to.be.revertedWithCustomError(condition, "ZeroInterval");
    });

    it("reverts with SlotOutOfBounds when timeSlot is out of range", async function () {
      const { condition } = await deployIntervalFixture();
      const ctx: string[] = []; // empty context
      await expect(
        condition.check(encodeIntervalParams(INTERVAL, 0), ctx),
      ).to.be.revertedWithCustomError(condition, "SlotOutOfBounds");
    });
  });

  // ── TimerCondition ───────────────────────────────────────────────────────

  describe("TimerCondition", function () {
    const DELTA   = 300n; // 5 minutes
    const TIME_SLOT = 0;

    function encodeTimerParams(delta: bigint, timeSlot: number): string {
      return abiCoder.encode(["uint256", "uint32"], [delta, timeSlot]);
    }

    async function deployTimerFixture() {
      const [owner, executor] = await ethers.getSigners();

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.createVault(
        owner.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));
      const condition = await ethers.deployContract("TimerCondition");

      return { vault, condition, owner, executor };
    }

    it("check returns false when slot is empty (timer not started)", async function () {
      const { condition } = await deployTimerFixture();
      const ctx = ["0x"];
      expect(await condition.check(encodeTimerParams(DELTA, TIME_SLOT), ctx)).to.equal(false);
    });

    it("check returns false when startTime is 0 (timer stopped)", async function () {
      const { condition } = await deployTimerFixture();
      const ctx = [abiCoder.encode(["uint256"], [0n])];
      expect(await condition.check(encodeTimerParams(DELTA, TIME_SLOT), ctx)).to.equal(false);
    });

    it("check returns false before delta has elapsed", async function () {
      const { condition } = await deployTimerFixture();
      const latest = await ethers.provider.getBlock("latest");
      const startTime = BigInt(latest!.timestamp); // started just now
      const ctx = [abiCoder.encode(["uint256"], [startTime])];
      // delta = 5 min, only 0 seconds have passed → false
      expect(await condition.check(encodeTimerParams(DELTA, TIME_SLOT), ctx)).to.equal(false);
    });

    it("check returns true after delta has elapsed", async function () {
      const { condition } = await deployTimerFixture();
      const latest = await ethers.provider.getBlock("latest");
      const startTime = BigInt(latest!.timestamp) - DELTA - 1n; // started more than delta ago
      const ctx = [abiCoder.encode(["uint256"], [startTime])];
      expect(await condition.check(encodeTimerParams(DELTA, TIME_SLOT), ctx)).to.equal(true);
    });

    it("afterExecution resets slot to 0 (stops the timer)", async function () {
      const { condition } = await deployTimerFixture();
      const latest = await ethers.provider.getBlock("latest");
      const startTime = BigInt(latest!.timestamp) - DELTA - 1n;
      const ctx = [abiCoder.encode(["uint256"], [startTime])];

      const [slots, values] = await condition.afterExecution(encodeTimerParams(DELTA, TIME_SLOT), ctx);
      expect(slots.length).to.equal(1);
      expect(slots[0]).to.equal(TIME_SLOT);
      const newVal: bigint = abiCoder.decode(["uint256"], values[0])[0] as bigint;
      expect(newVal).to.equal(0n);
    });

    it("full automation: timer fires once, then stops", async function () {
      const { vault, condition, owner, executor } = await deployTimerFixture();

      // Start the timer by writing startTime into slot 0
      const latest = await ethers.provider.getBlock("latest");
      const startTime = BigInt(latest!.timestamp);
      await vault.connect(owner).setContext([abiCoder.encode(["uint256"], [startTime])]);

      const params = encodeTimerParams(DELTA, TIME_SLOT);
      await vault.connect(owner).createAutomation([
        conditionStep(await condition.getAddress(), params, DONE, DONE, CHECK_SEL),
      ]);

      // Too early — delta not elapsed yet → condition false → revert for non-owner
      await expect(vault.connect(executor).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "TriggerNotMet");
      // Slot unchanged (trigger was false → afterExecution NOT called)
      let ctx = await vault.getContext();
      let stored: bigint = abiCoder.decode(["uint256"], ctx[0])[0] as bigint;
      expect(stored).to.equal(startTime);

      // Advance time past delta
      await ethers.provider.send("evm_increaseTime", [Number(DELTA)]);
      await ethers.provider.send("evm_mine", []);

      // Now the timer fires — afterExecution resets slot to 0
      await vault.connect(executor).executeAutomation(0);
      ctx = await vault.getContext();
      stored = abiCoder.decode(["uint256"], ctx[0])[0] as bigint;
      expect(stored).to.equal(0n); // stopped

      // Execute again immediately — slot is 0 → condition false → revert for non-owner
      await expect(vault.connect(executor).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "TriggerNotMet");
      // Slot still 0 — timer remains stopped
      ctx = await vault.getContext();
      stored = abiCoder.decode(["uint256"], ctx[0])[0] as bigint;
      expect(stored).to.equal(0n);
    });

    it("timer can be restarted after it has fired", async function () {
      const { vault, condition, owner, executor } = await deployTimerFixture();

      // Start the timer far in the past → already expired
      await vault.connect(owner).setContext([
        abiCoder.encode(["uint256"], [1n]), // Unix epoch = definitely past delta
      ]);

      const params = encodeTimerParams(DELTA, TIME_SLOT);
      await vault.connect(owner).createAutomation([
        conditionStep(await condition.getAddress(), params, DONE, DONE, CHECK_SEL),
      ]);

      // First fire → resets to 0
      await vault.connect(executor).executeAutomation(0);
      let ctx = await vault.getContext();
      expect(abiCoder.decode(["uint256"], ctx[0])[0]).to.equal(0n);

      // Restart: owner writes a new start time
      const latest = await ethers.provider.getBlock("latest");
      const newStart = BigInt(latest!.timestamp);
      await vault.connect(owner).setContextSlot(0, abiCoder.encode(["uint256"], [newStart]));

      // Too early again — delta not elapsed → condition false → revert for non-owner
      await expect(vault.connect(executor).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "TriggerNotMet");
      ctx = await vault.getContext();
      expect(abiCoder.decode(["uint256"], ctx[0])[0]).to.equal(newStart); // unchanged

      // Advance time and fire again
      await ethers.provider.send("evm_increaseTime", [Number(DELTA)]);
      await ethers.provider.send("evm_mine", []);
      await vault.connect(executor).executeAutomation(0);
      ctx = await vault.getContext();
      expect(abiCoder.decode(["uint256"], ctx[0])[0]).to.equal(0n); // stopped again
    });

    it("reverts with ZeroDelta", async function () {
      const { condition } = await deployTimerFixture();
      const ctx = [abiCoder.encode(["uint256"], [1n])];
      await expect(
        condition.afterExecution(encodeTimerParams(0n, TIME_SLOT), ctx),
      ).to.be.revertedWithCustomError(condition, "ZeroDelta");
    });

    it("reverts with SlotOutOfBounds when context is empty", async function () {
      const { condition } = await deployTimerFixture();
      await expect(
        condition.check(encodeTimerParams(DELTA, 0), []),
      ).to.be.revertedWithCustomError(condition, "SlotOutOfBounds");
    });
  });

  // ── Security: step validation ────────────────────────────────────────────

  describe("step validation security", function () {
    it("reverts when step target is zero address", async function () {
      const { vault } = await deployVaultFixture();
      await expect(
        vault.createAutomation([conditionStep(ethers.ZeroAddress, "0x", DONE)]),
      ).to.be.revertedWithCustomError(vault, "ZeroTargetAddress");
    });

    it("reverts when step selector is zero", async function () {
      const { vault, condition } = await deployVaultFixture();
      await expect(
        vault.createAutomation([
          {
            stepType: StepType.CONDITION,
            target: await condition.getAddress(),
            selector: "0x00000000",
            nextOnTrue: DONE,
            nextOnFalse: DONE,
            data: "0x",
          },
        ]),
      ).to.be.revertedWithCustomError(vault, "ZeroSelector");
    });

    it("reverts when ACTION step has non-DONE nextOnFalse", async function () {
      const { vault, condition, action } = await deployVaultFixture();
      await expect(
        vault.createAutomation([
          conditionStep(await condition.getAddress(), "0x", 1),
          {
            stepType: StepType.ACTION,
            target: await action.getAddress(),
            selector: EXECUTE_SEL,
            nextOnTrue: DONE,
            nextOnFalse: 0,
            data: "0x",
          },
        ]),
      ).to.be.revertedWithCustomError(vault, "InvalidStepReference");
    });

    it("reverts with ContextSlotOutOfBounds when action diff references a slot beyond ctx length", async function () {
      const { vault, condition, action, tokenA, owner } =
        await deployVaultFixture();

      const vaultAddress = await vault.getAddress();
      const amount = ethers.parseEther("10");
      await tokenA.transfer(vaultAddress, amount);
      await vault.setContext([enc("uint256", 0n)]); // ctx length = 1

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      // amountToSlot = 99 but ctx only has index 0 — out of bounds
      const actionData = encodeTransferParams(
        await tokenA.getAddress(),
        await owner.getAddress(),
        amount,
        NO_SLOT,
        99,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1),
        actionStep(await action.getAddress(), actionData),
      ]);

      await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(
        vault,
        "ContextSlotOutOfBounds",
      );
    });
  });

  // ── FeeDepositAction ─────────────────────────────────────────────────────

  describe("FeeDepositAction", function () {
    /**
     * Fixture: vault with FeeRegistry, minFeeDeposit set to 100 tokens.
     * tokenA is used as the main strategy token.
     * depositToken is the deposit currency held in FeeRegistry.
     */
    async function deployFeeDepositFixture() {
      const [owner, executor, recipient, other, protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy(
        "TokenA",
        "TKA",
        ethers.parseEther("1000000"),
      );
      const tokenB = await MockToken.deploy(
        "TokenB",
        "TKB",
        ethers.parseEther("1000000"),
      );
      const depositToken = await MockToken.deploy(
        "FeeToken",
        "FEE",
        ethers.parseEther("1000000"),
      );
      const feeAddr = await depositToken.getAddress();

      const action = await ethers.deployContract("ERC20TransferAction");
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(feeAddr, 18);
      await feeRegistry.setDistribution(
        protocolWallet.address,
        burnWallet.address,
        5000,
        2000,
        2000,
        1000,
      );
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100); // 1 %

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      // depositToken and creator fixed at creation
      await factory.setPriceOracle(await oracle.getAddress());
      await factory.createVault(
        owner.address,
        feeAddr,
        owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );

      await vault.setMinFeeDeposit(ethers.parseEther("100")); // 100 token minimum

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const feeDepositAction = await ethers.deployContract("FeeDepositAction");

      return {
        vault,
        factory,
        condition,
        action,
        tokenA,
        tokenB,
        feeRegistry,
        depositToken,
        feeAddr,
        feeDepositAction,
        owner,
        executor,
        recipient,
        other,
        protocolWallet,
        burnWallet,
      };
    }

    function encodeFeeDepositParams(
      feeRegistry: string,
      token: string,
      topUpAmount: bigint = 0n,
    ): string {
      return abiCoder.encode(
        ["address", "address", "uint256"],
        [feeRegistry, token, topUpAmount],
      );
    }

    it("minFeeDeposit defaults to 0", async function () {
      const { vault } = await deployVaultFixture();
      expect(await vault.minFeeDeposit()).to.equal(0n);
    });

    it("owner can set minFeeDeposit", async function () {
      const { vault } = await deployVaultFixture();
      const amount = ethers.parseEther("50");
      await expect(vault.setMinFeeDeposit(amount))
        .to.emit(vault, "MinFeeDepositUpdated")
        .withArgs(amount);
      expect(await vault.minFeeDeposit()).to.equal(amount);
    });

    it("tops up deposit when balance is below minimum (topUpAmount=0 fills exactly to min)", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        recipient,
        feeRegistry,
        depositToken,
        feeAddr,
        feeDepositAction,
        executor,
      } = await deployFeeDepositFixture();

      const vaultAddress = await vault.getAddress();
      const registryAddress = await feeRegistry.getAddress();

      // Give vault some fee tokens for the top-up AND some tokenA for the transfer action.
      await depositToken.transfer(vaultAddress, ethers.parseEther("200"));
      await tokenA.transfer(vaultAddress, ethers.parseEther("50"));

      // Initial deposit: 0 (nothing pre-deposited)
      expect(await feeRegistry.vaultDeposit(vaultAddress, feeAddr)).to.equal(
        0n,
      );

      // Automation: condition → transfer action → fee top-up action
      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
      const transferData = encodeTransferParams(
        await tokenA.getAddress(),
        await recipient.getAddress(),
        ethers.parseEther("50"),
      );
      const feeDepositData = encodeFeeDepositParams(registryAddress, feeAddr);

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1),
        actionStep(await action.getAddress(), transferData, 2),
        actionStep(await feeDepositAction.getAddress(), feeDepositData),
      ]);

      await vault.connect(executor).executeAutomation(0);

      // FeeDepositAction topped up to 100.  Then _settleFees deducted 0.5 (1 % of $50).
      // Net deposit: 100 − 0.5 = 99.5
      expect(await feeRegistry.vaultDeposit(vaultAddress, feeAddr)).to.equal(
        ethers.parseEther("99.5"),
      );
      // Vault's fee token balance: 200 − 100 (top-up) = 100
      expect(await depositToken.balanceOf(vaultAddress)).to.equal(
        ethers.parseEther("100"),
      );
    });

    it("tops up by fixed topUpAmount when specified", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        recipient,
        feeRegistry,
        depositToken,
        feeAddr,
        feeDepositAction,
        executor,
      } = await deployFeeDepositFixture();

      const vaultAddress = await vault.getAddress();
      const registryAddress = await feeRegistry.getAddress();

      await depositToken.transfer(vaultAddress, ethers.parseEther("200"));
      await tokenA.transfer(vaultAddress, ethers.parseEther("50"));

      const fixedTopUp = ethers.parseEther("30"); // less than min (100) but fixed

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("50"),
          ),
          2,
        ),
        actionStep(
          await feeDepositAction.getAddress(),
          encodeFeeDepositParams(registryAddress, feeAddr, fixedTopUp),
        ),
      ]);

      await vault.connect(executor).executeAutomation(0);

      // Deposited exactly the fixed top-up amount
      // (minus the 0.5 token fee deducted from deposit after execution — but deposit was 0 initially
      //  so deductFees will revert! We need to pre-seed the deposit a little)
      // Re-do: seed 0.5 tokens first so fee settlement doesn't revert
      // Actually the test flow is: top-up happens in step 2, fee deducted after. Deposit = 30.
      // Fee deduction: 1% of $50 = $0.50 → 0.5 tokens. 30 - 0.5 = 29.5 remaining.
      expect(await feeRegistry.vaultDeposit(vaultAddress, feeAddr)).to.equal(
        fixedTopUp - ethers.parseEther("0.5"),
      );
    });

    it("is a no-op when deposit is already above minimum", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        recipient,
        feeRegistry,
        depositToken,
        feeAddr,
        feeDepositAction,
        executor,
      } = await deployFeeDepositFixture();

      const vaultAddress = await vault.getAddress();
      const registryAddress = await feeRegistry.getAddress();

      // Pre-seed 500 tokens (well above the 100 minimum)
      await depositToken.approve(registryAddress, ethers.parseEther("500"));
      await feeRegistry.depositFor(
        vaultAddress,
        feeAddr,
        ethers.parseEther("500"),
      );

      await depositToken.transfer(vaultAddress, ethers.parseEther("200")); // vault has extra depositTokens
      await tokenA.transfer(vaultAddress, ethers.parseEther("50"));

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("50"),
          ),
          2,
        ),
        actionStep(
          await feeDepositAction.getAddress(),
          encodeFeeDepositParams(registryAddress, feeAddr),
        ),
      ]);

      const depositBefore = await feeRegistry.vaultDeposit(
        vaultAddress,
        feeAddr,
      );
      await vault.connect(executor).executeAutomation(0);
      const depositAfter = await feeRegistry.vaultDeposit(
        vaultAddress,
        feeAddr,
      );

      // Deposit only decreased by the fee paid — no top-up occurred
      expect(depositAfter).to.equal(depositBefore - ethers.parseEther("0.5"));
    });

    it("caps top-up at vault's available token balance (no revert on shortage)", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        recipient,
        feeRegistry,
        depositToken,
        feeAddr,
        feeDepositAction,
        executor,
      } = await deployFeeDepositFixture();

      const vaultAddress = await vault.getAddress();
      const registryAddress = await feeRegistry.getAddress();

      // Vault has only 40 fee tokens — less than the 100 minimum → deposits all it has
      await depositToken.transfer(vaultAddress, ethers.parseEther("40"));
      // Pre-seed just enough to cover the 0.5-token fee so execution doesn't revert
      await depositToken.approve(registryAddress, ethers.parseEther("1"));
      await feeRegistry.depositFor(
        vaultAddress,
        feeAddr,
        ethers.parseEther("1"),
      );

      await tokenA.transfer(vaultAddress, ethers.parseEther("50"));

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("50"),
          ),
          2,
        ),
        actionStep(
          await feeDepositAction.getAddress(),
          encodeFeeDepositParams(registryAddress, feeAddr),
        ),
      ]);

      // Should not revert even though vault can't fully meet the minimum
      await vault.connect(executor).executeAutomation(0);

      // All 40 vault tokens deposited (vault balance now 0)
      expect(await depositToken.balanceOf(vaultAddress)).to.equal(0n);
      // seed (1) + 40 top-up − 0.5 fee deducted = 40.5
      expect(await feeRegistry.vaultDeposit(vaultAddress, feeAddr)).to.equal(
        ethers.parseEther("40.5"),
      );
    });

    it("minFeeDeposit=0 disables the check — no top-up even when deposit is empty", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        recipient,
        feeRegistry,
        depositToken,
        feeAddr,
        feeDepositAction,
        executor,
      } = await deployFeeDepositFixture();

      await vault.setMinFeeDeposit(0); // disable minimum

      const vaultAddress = await vault.getAddress();
      const registryAddress = await feeRegistry.getAddress();

      // Pre-seed enough to cover the fee but no more
      await depositToken.approve(registryAddress, ethers.parseEther("1"));
      await feeRegistry.depositFor(
        vaultAddress,
        feeAddr,
        ethers.parseEther("1"),
      );

      await depositToken.transfer(vaultAddress, ethers.parseEther("200")); // available for top-up
      await tokenA.transfer(vaultAddress, ethers.parseEther("50"));

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("50"),
          ),
          2,
        ),
        actionStep(
          await feeDepositAction.getAddress(),
          encodeFeeDepositParams(registryAddress, feeAddr),
        ),
      ]);

      await vault.connect(executor).executeAutomation(0);

      // No top-up happened — vault's fee token balance unchanged
      expect(await depositToken.balanceOf(vaultAddress)).to.equal(
        ethers.parseEther("200"),
      );
    });
  });

  // ── Gas compensation ──────────────────────────────────────────────────────

  describe("gas compensation", function () {
    /**
     * Fixture with gas config enabled.
     *
     * nativeTokenPriceUSD = $3000 per ETH (18 dec)
     * executorMarkupBps   = 2000  (20 % markup over raw gas cost)
     * gasOverhead         = 0     (simplifies expected values in tests)
     *
     * depositToken has 18 decimals, same as the USD amounts used internally.
     * Large deposit (1 000 000 tokens) so the vault never runs out.
     */
    async function deployWithGasConfigFixture() {
      const [owner, executor, recipient, other, protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy(
        "TokenA",
        "TKA",
        ethers.parseEther("1000000"),
      );
      const tokenB = await MockToken.deploy(
        "TokenB",
        "TKB",
        ethers.parseEther("1000000"),
      );
      const depositToken = await MockToken.deploy(
        "FeeToken",
        "FEE",
        ethers.parseEther("10000000"),
      );
      const feeAddr = await depositToken.getAddress();

      const action = await ethers.deployContract("ERC20TransferAction");
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(feeAddr, 18);
      await feeRegistry.setDistribution(
        protocolWallet.address,
        burnWallet.address,
        5000,
        2000,
        2000,
        1000,
      );
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100); // 1 %

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(tokenA, ethers.parseEther("1"));
      await oracle.setPrice(ethers.ZeroAddress, ethers.parseEther("3000"));

      // $3000 / ETH, 20 % markup
      await feeRegistry.setGasConfig(await oracle.getAddress(), ethers.ZeroAddress, 2000, 0, 0);

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());
      await factory.createVault(
        owner.address,
        feeAddr,
        owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );

      const condition = await ethers.deployContract("TokenBalanceCondition");

      // Pre-deposit large amount
      const vaultAddress = await vault.getAddress();
      await depositToken.approve(
        await feeRegistry.getAddress(),
        ethers.parseEther("1000000"),
      );
      await feeRegistry.depositFor(
        vaultAddress,
        feeAddr,
        ethers.parseEther("1000000"),
      );

      return {
        vault,
        factory,
        condition,
        action,
        tokenA,
        tokenB,
        feeRegistry,
        depositToken,
        feeAddr,
        oracle,
        owner,
        executor,
        recipient,
        other,
        protocolWallet,
        burnWallet,
      };
    }

    it("gasCompTokens=0 when no oracle is configured", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        executor,
        recipient,
        feeRegistry,
        depositToken,
        owner,
      } = await deployWithFeeSettlementFixtureNoGasConfig();

      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("100"));

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("100"),
          ),
        ),
      ]);

      const feeAddr = await depositToken.getAddress();

      // no oracle configured → gasCompTokens must be 0
      await expect(vault.connect(executor).executeAutomation(0))
        .to.emit(vault, "FeesSettled")
        .withArgs(
          0n,
          executor.address,
          feeAddr,
          owner.address,
          ethers.parseEther("1"),
          ethers.parseEther("1"),
          0n,
        );
    });

    async function deployWithFeeSettlementFixtureNoGasConfig() {
      const [owner, executor, recipient, other, protocolWallet, burnWallet] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy(
        "TokenA",
        "TKA",
        ethers.parseEther("1000000"),
      );
      const tokenB = await MockToken.deploy(
        "TokenB",
        "TKB",
        ethers.parseEther("1000000"),
      );
      const depositToken = await MockToken.deploy(
        "FeeToken",
        "FEE",
        ethers.parseEther("1000000"),
      );

      const action = await ethers.deployContract("ERC20TransferAction");
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address,
        burnWallet.address,
        5000,
        2000,
        2000,
        1000,
      );
      await feeRegistry.setFee(await action.getAddress(), EXECUTE_SEL, 100);

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory = await ethers.deployContract(
        "StrategyBuilderVaultFactory",
      );
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());
      await factory.createVault(
        owner.address,
        await depositToken.getAddress(),
        owner.address,
        ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt(
        "StrategyBuilderVault",
        await factory.getVault(0),
      );

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const vaultAddress = await vault.getAddress();
      await depositToken.approve(
        await feeRegistry.getAddress(),
        ethers.parseEther("1000"),
      );
      await feeRegistry.depositFor(
        vaultAddress,
        await depositToken.getAddress(),
        ethers.parseEther("1000"),
      );

      return {
        vault,
        factory,
        condition,
        action,
        tokenA,
        tokenB,
        feeRegistry,
        depositToken,
        owner,
        executor,
        recipient,
        other,
        protocolWallet,
        burnWallet,
      };
    }

    it("gas comp acts as minimum fee — used when it exceeds volume-based fee", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        executor,
        recipient,
        feeRegistry,
        depositToken,
        feeAddr,
      } = await deployWithGasConfigFixture();

      const vaultAddress = await vault.getAddress();

      // Very small volume → volume-based fee will be tiny; gas comp should dominate
      await tokenA.transfer(vaultAddress, 1n);
      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          // tokenPriceUSD = 0 → volumeUSD = 0 → feeUSD = 0
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            1n,
          ),
        ),
      ]);

      const tx = await vault.connect(executor).executeAutomation(0);
      const receipt = await tx.wait();

      // Find FeesSettled log
      const settled = receipt?.logs.find(
        (l) =>
          l.topics[0] === vault.interface.getEvent("FeesSettled").topicHash,
      );
      expect(settled).to.not.be.undefined;

      const decoded = vault.interface.decodeEventLog(
        "FeesSettled",
        settled!.data,
        settled!.topics,
      );
      // totalTokens == gasCompTokens (volume was 0)
      expect(decoded.depositTokenAmount).to.equal(decoded.gasCompTokens);
      expect(decoded.gasCompTokens).to.be.gt(0n);
    });

    it("gas comp is paid to executor; executor also gets executorBps of remainder", async function () {
      const {
        vault,
        condition,
        action,
        tokenA,
        executor,
        recipient,
        feeRegistry,
        depositToken,
        feeAddr,
      } = await deployWithGasConfigFixture();

      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("100"));

      await vault.createAutomation([
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(
            await tokenA.getAddress(),
            vaultAddress,
            1n,
            true,
          ),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(
            await tokenA.getAddress(),
            await recipient.getAddress(),
            ethers.parseEther("100"),
          ),
        ),
      ]);

      const tx = await vault.connect(executor).executeAutomation(0);
      const receipt = await tx.wait();

      const settled = receipt?.logs.find(
        (l) =>
          l.topics[0] === vault.interface.getEvent("FeesSettled").topicHash,
      );
      const decoded = vault.interface.decodeEventLog(
        "FeesSettled",
        settled!.data,
        settled!.topics,
      );

      const totalTokens = decoded.depositTokenAmount as bigint;
      const gasCompTokens = decoded.gasCompTokens as bigint;
      const remaining = totalTokens - gasCompTokens;

      // executorBps = 2000 → 20 % of remaining
      const executorSplit = (remaining * 2000n) / 10_000n;
      const expectedExecutor = gasCompTokens + executorSplit;

      expect(await feeRegistry.claimable(executor.address, feeAddr)).to.equal(
        expectedExecutor,
      );
    });

    it("estimateGasComp returns non-zero for typical gas params", async function () {
      const { feeRegistry, depositToken, feeAddr } =
        await deployWithGasConfigFixture();

      const gasUsed = 200_000n;
      const gasPrice = ethers.parseUnits("5", "gwei");

      const estimate = await feeRegistry.estimateGasComp(
        feeAddr,
        gasUsed,
        gasPrice,
      );
      expect(estimate).to.be.gt(0n);
    });

    it("estimateGasComp returns 0 when no oracle is set", async function () {
      const { feeRegistry, depositToken, feeAddr } =
        await deployWithGasConfigFixture();

      // Disable gas config
      await feeRegistry.setGasConfig(ethers.ZeroAddress, ethers.ZeroAddress, 0, 0, 0);

      const estimate = await feeRegistry.estimateGasComp(
        feeAddr,
        200_000n,
        ethers.parseUnits("5", "gwei"),
      );
      expect(estimate).to.equal(0n);
    });
  });

  // ─── Owner automation ───────────────────────────────────────────────────────

  describe("createOwnerAutomation / owner-only execution", function () {
    async function deployOwnerAutomationFixture() {
      const [owner, other] = await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy("TokenA", "TKA", ethers.parseEther("1000000"));

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());

      const vaultAddress = await factory.createVault.staticCall(
        owner.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroHash,
      );
      await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroHash);

      const vault = await ethers.getContractAt("StrategyBuilderVault", vaultAddress);

      const action = await ethers.deployContract("ERC20TransferAction");

      return { vault, tokenA, action, owner, other };
    }

    it("createOwnerAutomation accepts step 0 as ACTION", async function () {
      const { vault, tokenA, action, owner } = await deployOwnerAutomationFixture();

      const steps = [
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), owner.address, ethers.parseEther("1")),
        ),
      ];

      await expect(vault.createOwnerAutomation(steps))
        .to.emit(vault, "AutomationCreated")
        .withArgs(0n, 1n);

      const [, ownerOnly] = await vault.getAutomation(0);
      expect(ownerOnly).to.be.true;
    });

    it("createOwnerAutomation also accepts step 0 as CONDITION", async function () {
      const { vault, tokenA, action, owner } = await deployOwnerAutomationFixture();
      const condition = await ethers.deployContract("TokenBalanceCondition");

      const steps = [
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), await vault.getAddress(), 1n, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), owner.address, ethers.parseEther("1")),
        ),
      ];

      await vault.createOwnerAutomation(steps);
      const [, ownerOnly] = await vault.getAutomation(0);
      expect(ownerOnly).to.be.true;
    });

    it("createAutomation (public) still rejects step 0 as ACTION", async function () {
      const { vault, tokenA, action } = await deployOwnerAutomationFixture();

      const steps = [
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), ethers.ZeroAddress, 0n),
        ),
      ];

      await expect(vault.createAutomation(steps))
        .to.be.revertedWithCustomError(vault, "FirstStepMustBeCondition");
    });

    it("non-owner cannot execute an owner-only automation", async function () {
      const { vault, tokenA, action, owner, other } = await deployOwnerAutomationFixture();

      await tokenA.transfer(await vault.getAddress(), ethers.parseEther("10"));
      const steps = [
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), owner.address, ethers.parseEther("1")),
        ),
      ];
      await vault.createOwnerAutomation(steps);

      await expect(vault.connect(other).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "CallerNotOwner");
    });

    it("owner can execute an owner-only automation and actions run", async function () {
      const { vault, tokenA, action, owner } = await deployOwnerAutomationFixture();

      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("10"));

      const steps = [
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), owner.address, ethers.parseEther("3")),
        ),
      ];
      await vault.createOwnerAutomation(steps);

      const balBefore = await tokenA.balanceOf(owner.address);
      await vault.executeAutomation(0);
      const balAfter = await tokenA.balanceOf(owner.address);

      expect(balAfter - balBefore).to.equal(ethers.parseEther("3"));
    });

    it("owner-only automation with condition: condition still gates execution", async function () {
      const { vault, tokenA, action, owner } = await deployOwnerAutomationFixture();

      const vaultAddress = await vault.getAddress();
      const condition    = await ethers.deployContract("TokenBalanceCondition");

      // Condition: vault must hold >= 100 tokens
      const threshold = ethers.parseEther("100");
      const steps = [
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), vaultAddress, threshold, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), owner.address, threshold),
        ),
      ];
      await vault.createOwnerAutomation(steps);

      // Vault has 0 tokens — condition false → no transfer
      const balBefore = await tokenA.balanceOf(owner.address);
      await vault.executeAutomation(0);
      expect(await tokenA.balanceOf(owner.address)).to.equal(balBefore);

      // Fund the vault — condition true → action transfers threshold back to owner
      // Net change vs balBefore: owner sent threshold to vault, action returns it → 0
      await tokenA.transfer(vaultAddress, threshold);
      await vault.executeAutomation(0);
      expect(await tokenA.balanceOf(owner.address)).to.equal(balBefore);
    });

    it("isTriggerMet returns true for owner-only automation with ACTION at step 0", async function () {
      const { vault, tokenA, action, owner } = await deployOwnerAutomationFixture();

      const steps = [
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), owner.address, ethers.parseEther("1")),
        ),
      ];
      await vault.createOwnerAutomation(steps);

      expect(await vault.isTriggerMet(0)).to.be.true;
    });

    it("owner pays no fees when executing any automation", async function () {
      const [owner, executor, protocolWallet, burnWallet] = await ethers.getSigners();

      // Setup with full fee registry
      const MockToken    = await ethers.getContractFactory("MockERC20");
      const depositToken = await MockToken.deploy("FEE", "FEE", ethers.parseEther("1000000"));
      const tokenA       = await MockToken.deploy("TKA", "TKA", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address, burnWallet.address, 5000, 2000, 2000, 1000,
      );

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());
      await feeRegistry.setFee(
        await (await ethers.deployContract("ERC20TransferAction")).getAddress(),
        id("execute(bytes,bytes[])").slice(0, 10),
        100, // 1 %
      );

      const vaultAddress = await factory.createVault.staticCall(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      await factory.createVault(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt("StrategyBuilderVault", vaultAddress);

      const action = await ethers.deployContract("ERC20TransferAction");
      const transferAmount = ethers.parseEther("100");

      await tokenA.transfer(vaultAddress, transferAmount);
      await depositToken.approve(await feeRegistry.getAddress(), ethers.parseEther("100"));
      await feeRegistry.depositFor(vaultAddress, await depositToken.getAddress(), ethers.parseEther("100"));

      const steps = [
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), executor.address, transferAmount),
        ),
      ];
      await vault.createOwnerAutomation(steps);

      const depositBefore = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      // Owner executes — no fees should be deducted
      await vault.executeAutomation(0);

      const depositAfter = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      expect(depositAfter).to.equal(depositBefore); // unchanged
    });

    it("non-owner executor of a public automation still pays fees", async function () {
      const [owner, executor, protocolWallet, burnWallet] = await ethers.getSigners();

      const MockToken    = await ethers.getContractFactory("MockERC20");
      const depositToken = await MockToken.deploy("FEE", "FEE", ethers.parseEther("1000000"));
      const tokenA       = await MockToken.deploy("TKA", "TKA", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address, burnWallet.address, 5000, 2000, 2000, 1000,
      );

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await tokenA.getAddress(), ethers.parseEther("1"));

      const action      = await ethers.deployContract("ERC20TransferAction");
      const vaultImpl   = await ethers.deployContract("StrategyBuilderVault");
      const factory     = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());
      await feeRegistry.setFee(
        await action.getAddress(),
        id("execute(bytes,bytes[])").slice(0, 10),
        100,
      );

      const vaultAddress = await factory.createVault.staticCall(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      await factory.createVault(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      const vault     = await ethers.getContractAt("StrategyBuilderVault", vaultAddress);
      const condition = await ethers.deployContract("TokenBalanceCondition");

      const transferAmount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, transferAmount);
      await depositToken.approve(await feeRegistry.getAddress(), ethers.parseEther("100"));
      await feeRegistry.depositFor(vaultAddress, await depositToken.getAddress(), ethers.parseEther("100"));

      const steps = [
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), vaultAddress, 1n, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), executor.address, transferAmount),
        ),
      ];
      await vault.createAutomation(steps);

      const depositBefore = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      // Non-owner executes — fees ARE deducted
      await vault.connect(executor).executeAutomation(0);

      const depositAfter = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      expect(depositAfter).to.be.lessThan(depositBefore);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("protocol token", function () {
    // Shared fixture: FeeRegistry with protocolToken configured + a vault owner
    async function deployProtocolTokenFixture() {
      const [owner, executor, protocolWallet, burnWallet, otherOwner] =
        await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const protoToken   = await MockToken.deploy("PROTO", "PROTO", ethers.parseEther("1000000"));
      const depositToken = await MockToken.deploy("FEE",   "FEE",   ethers.parseEther("1000000"));
      const tokenA       = await MockToken.deploy("TKA",   "TKA",   ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await protoToken.getAddress(),   18);
      await feeRegistry.addAcceptedToken(await depositToken.getAddress(), 18);
      await feeRegistry.setDistribution(
        protocolWallet.address, burnWallet.address, 5000, 2000, 2000, 1000,
      );

      const oracle = await ethers.deployContract("MockPriceOracle");
      // protoToken at $1 (same as depositToken)
      await oracle.setPrice(await protoToken.getAddress(),   ethers.parseEther("1"));
      await oracle.setPrice(await tokenA.getAddress(),       ethers.parseEther("1"));

      const action    = await ethers.deployContract("ERC20TransferAction");
      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.setPriceOracle(await oracle.getAddress());

      await feeRegistry.setFee(
        await action.getAddress(),
        id("execute(bytes,bytes[])").slice(0, 10),
        100, // 1 %
      );

      // Set proto token with 50 % discount on volume fee
      await feeRegistry.setProtocolToken(await protoToken.getAddress(), 5000);

      // Set fee reduction gate (needed for protocol token path)
      await feeRegistry.setFeeReductionConfig(ethers.ZeroAddress, await factory.getAddress());

      // Create a vault owned by `owner`
      const vaultAddress = await factory.createVault.staticCall(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      await factory.createVault(
        owner.address, await depositToken.getAddress(), ethers.ZeroAddress, ethers.ZeroHash,
      );
      const vault = await ethers.getContractAt("StrategyBuilderVault", vaultAddress);

      // Fund vault deposit-token balance for fallback tests
      await depositToken.approve(await feeRegistry.getAddress(), ethers.parseEther("10000"));
      await feeRegistry.depositFor(vaultAddress, await depositToken.getAddress(), ethers.parseEther("10000"));

      // Give owner some proto tokens
      await protoToken.transfer(owner.address, ethers.parseEther("100000"));

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const transferAmount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddress, transferAmount);

      // Standard public automation: condition → action
      const steps = [
        conditionStep(
          await condition.getAddress(),
          encodeBalanceParams(await tokenA.getAddress(), vaultAddress, 1n, true),
          1,
        ),
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), executor.address, transferAmount),
        ),
      ];
      await vault.createAutomation(steps);

      return {
        vault, feeRegistry, oracle, factory,
        protoToken, depositToken, tokenA,
        action, condition,
        owner, executor, protocolWallet, burnWallet, otherOwner,
        vaultAddress,
      };
    }

    it("depositProtocolToken: credits ownerProtocolDeposits[owner][token]", async function () {
      const { feeRegistry, protoToken, owner } = await deployProtocolTokenFixture();
      const amount = ethers.parseEther("500");
      await protoToken.connect(owner).approve(await feeRegistry.getAddress(), amount);
      await feeRegistry.connect(owner).depositProtocolToken(amount);
      expect(
        await feeRegistry.ownerProtocolDeposits(owner.address, await protoToken.getAddress()),
      ).to.equal(amount);
    });

    it("depositProtocolToken: reverts when protocolToken is not set", async function () {
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await expect(feeRegistry.depositProtocolToken(1n))
        .to.be.revertedWithCustomError(feeRegistry, "ProtocolTokenNotSet");
    });

    it("withdrawProtocolToken: owner reclaims tokens", async function () {
      const { feeRegistry, protoToken, owner } = await deployProtocolTokenFixture();
      const amount = ethers.parseEther("500");
      await protoToken.connect(owner).approve(await feeRegistry.getAddress(), amount);
      await feeRegistry.connect(owner).depositProtocolToken(amount);

      const balBefore = await protoToken.balanceOf(owner.address);
      await feeRegistry.connect(owner).withdrawProtocolToken(await protoToken.getAddress(), amount);
      const balAfter = await protoToken.balanceOf(owner.address);

      expect(balAfter - balBefore).to.equal(amount);
      expect(
        await feeRegistry.ownerProtocolDeposits(owner.address, await protoToken.getAddress()),
      ).to.equal(0n);
    });

    it("withdrawProtocolToken(0): withdraws full balance", async function () {
      const { feeRegistry, protoToken, owner } = await deployProtocolTokenFixture();
      const amount = ethers.parseEther("200");
      await protoToken.connect(owner).approve(await feeRegistry.getAddress(), amount);
      await feeRegistry.connect(owner).depositProtocolToken(amount);

      await feeRegistry.connect(owner).withdrawProtocolToken(await protoToken.getAddress(), 0n);
      expect(
        await feeRegistry.ownerProtocolDeposits(owner.address, await protoToken.getAddress()),
      ).to.equal(0n);
    });

    it("withdrawProtocolToken: reverts when nothing to withdraw", async function () {
      const { feeRegistry, protoToken, owner } = await deployProtocolTokenFixture();
      await expect(
        feeRegistry.connect(owner).withdrawProtocolToken(await protoToken.getAddress(), 1n),
      ).to.be.revertedWithCustomError(feeRegistry, "NothingToWithdraw");
    });

    it("setProtocolToken: reverts when token is not accepted", async function () {
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("T", "T", 1000n);
      await expect(
        feeRegistry.setProtocolToken(await token.getAddress(), 0),
      ).to.be.revertedWithCustomError(feeRegistry, "TokenNotAccepted");
    });

    it("setProtocolToken: reverts when discountBps > 10_000", async function () {
      const { feeRegistry, protoToken } = await deployProtocolTokenFixture();
      await expect(
        feeRegistry.setProtocolToken(await protoToken.getAddress(), 10_001),
      ).to.be.revertedWithCustomError(feeRegistry, "InvalidDiscountBps");
    });

    it("fees paid in proto token when owner has sufficient balance (50 % discount)", async function () {
      const { vault, feeRegistry, protoToken, depositToken, owner, executor, vaultAddress } =
        await deployProtocolTokenFixture();

      // Owner deposits 1000 proto tokens
      const deposit = ethers.parseEther("1000");
      await protoToken.connect(owner).approve(await feeRegistry.getAddress(), deposit);
      await feeRegistry.connect(owner).depositProtocolToken(deposit);

      const depositTokenBefore = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );
      const protoOwnerBefore = await feeRegistry.ownerProtocolDeposits(
        owner.address, await protoToken.getAddress(),
      );

      // Execute automation (executor is non-owner so fees would normally apply)
      await vault.connect(executor).executeAutomation(0);

      const depositTokenAfter = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );
      const protoOwnerAfter = await feeRegistry.ownerProtocolDeposits(
        owner.address, await protoToken.getAddress(),
      );

      // Deposit token balance must be UNCHANGED (proto token used instead)
      expect(depositTokenAfter).to.equal(depositTokenBefore);
      // Proto token balance must have decreased
      expect(protoOwnerAfter).to.be.lessThan(protoOwnerBefore);
    });

    it("falls back to deposit token when proto balance is insufficient", async function () {
      const { vault, feeRegistry, protoToken, depositToken, owner, executor, vaultAddress } =
        await deployProtocolTokenFixture();

      // Owner deposits only 1 wei of proto token — definitely not enough
      await protoToken.connect(owner).approve(await feeRegistry.getAddress(), 1n);
      await feeRegistry.connect(owner).depositProtocolToken(1n);

      const depositTokenBefore = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      await vault.connect(executor).executeAutomation(0);

      const depositTokenAfter = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      // Should have fallen back — deposit token was consumed
      expect(depositTokenAfter).to.be.lessThan(depositTokenBefore);
    });

    it("falls back when no proto deposit at all", async function () {
      const { vault, feeRegistry, depositToken, executor, vaultAddress } =
        await deployProtocolTokenFixture();

      const depositTokenBefore = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      await vault.connect(executor).executeAutomation(0);

      const depositTokenAfter = await feeRegistry.vaultDeposit(
        vaultAddress, await depositToken.getAddress(),
      );

      expect(depositTokenAfter).to.be.lessThan(depositTokenBefore);
    });

    it("proto token claimable balances are distributed correctly", async function () {
      const {
        vault, feeRegistry, protoToken, owner, executor, protocolWallet, vaultAddress,
      } = await deployProtocolTokenFixture();

      const deposit = ethers.parseEther("1000");
      await protoToken.connect(owner).approve(await feeRegistry.getAddress(), deposit);
      await feeRegistry.connect(owner).depositProtocolToken(deposit);

      const execClaimBefore  = await feeRegistry.claimable(executor.address,      await protoToken.getAddress());
      const protoClaimBefore = await feeRegistry.claimable(protocolWallet.address, await protoToken.getAddress());

      await vault.connect(executor).executeAutomation(0);

      const execClaimAfter  = await feeRegistry.claimable(executor.address,      await protoToken.getAddress());
      const protoClaimAfter = await feeRegistry.claimable(protocolWallet.address, await protoToken.getAddress());

      // Both executor and protocol wallet should have received something
      expect(execClaimAfter).to.be.greaterThan(execClaimBefore);
      expect(protoClaimAfter).to.be.greaterThan(protoClaimBefore);
    });

    it("discount 0 (no discount): proto token amount equals normal deposit-token amount", async function () {
      const { feeRegistry, protoToken, factory } = await deployProtocolTokenFixture();

      // Re-configure with 0 % discount so we can assert exact amounts
      await feeRegistry.setProtocolToken(await protoToken.getAddress(), 0);

      // The fee token amount for 1e18 USD in protoToken (18 dec, $1 each) = 1e18
      const expected = await feeRegistry.feeTokenAmount(await protoToken.getAddress(), ethers.parseEther("1"));
      expect(expected).to.equal(ethers.parseEther("1"));
    });

    it("withdrawProtocolToken works for an old token after protocolToken was changed", async function () {
      const { feeRegistry, protoToken, owner } = await deployProtocolTokenFixture();

      const amount = ethers.parseEther("100");
      await protoToken.connect(owner).approve(await feeRegistry.getAddress(), amount);
      await feeRegistry.connect(owner).depositProtocolToken(amount);

      // Owner of feeRegistry changes protocol token to address(0)
      await feeRegistry.setProtocolToken(ethers.ZeroAddress, 0);

      // Owner should still be able to withdraw the old proto token
      const balBefore = await protoToken.balanceOf(owner.address);
      await feeRegistry.connect(owner).withdrawProtocolToken(await protoToken.getAddress(), amount);
      const balAfter = await protoToken.balanceOf(owner.address);

      expect(balAfter - balBefore).to.equal(amount);
    });
  });
});
