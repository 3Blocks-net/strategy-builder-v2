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

const CHECK_SEL      = id("check(bytes,bytes[])").slice(0, 10);
const EXECUTE_SEL    = id("execute(bytes,bytes[])").slice(0, 10);
const AFTER_EXEC_SEL = id("afterExecution(bytes,bytes[])").slice(0, 10);

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

function encodeTimerParams(delta: bigint, timeSlot: number): string {
  return abiCoder.encode(["uint256", "uint32"], [delta, timeSlot]);
}

function encodeTransferParams(
  token: string,
  recipient: string,
  amount: bigint,
  amountFromSlot: number = NO_SLOT,
  amountToSlot: number = NO_SLOT,
  feeRegistry: string = ethers.ZeroAddress,
): string {
  return abiCoder.encode(
    ["address", "address", "uint256", "uint32", "uint32", "address"],
    [token, recipient, amount, amountFromSlot, amountToSlot, feeRegistry],
  );
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

    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(
      owner.address,
      ethers.ZeroAddress,
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

  // ── Deposit / Withdraw fees ─────────────────────────────────────────────

  describe("vault deposit / withdraw", function () {
    async function deployWithFeeRegistryFixture() {
      const [owner, executor, recipient, other] = await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy("TokenA", "TKA", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await tokenA.getAddress(), 18);
      await feeRegistry.setDepositFeeBps(100); // 1%
      await feeRegistry.setWithdrawFeeBps(50);  // 0.5%

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());

      await factory.createVault(owner.address, await tokenA.getAddress(), ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

      return { vault, factory, feeRegistry, tokenA, owner, executor, recipient, other };
    }

    it("deposit pulls tokens and deducts fee to FeeRegistry", async function () {
      const { vault, feeRegistry, tokenA, owner } = await deployWithFeeRegistryFixture();
      const vaultAddr = await vault.getAddress();
      const regAddr = await feeRegistry.getAddress();
      const amount = ethers.parseEther("1000");
      const fee = amount * 100n / 10_000n; // 1%

      await tokenA.approve(vaultAddr, amount);

      await expect(vault.deposit(await tokenA.getAddress(), amount))
        .to.emit(vault, "Deposited")
        .withArgs(await tokenA.getAddress(), amount);

      expect(await tokenA.balanceOf(vaultAddr)).to.equal(amount - fee);
      expect(await feeRegistry.collectedFees(await tokenA.getAddress())).to.equal(fee);
    });

    it("deposit with feeBps=0 transfers full amount", async function () {
      const { vault, feeRegistry, tokenA, owner } = await deployWithFeeRegistryFixture();
      await feeRegistry.setDepositFeeBps(0);

      const vaultAddr = await vault.getAddress();
      const amount = ethers.parseEther("500");
      await tokenA.approve(vaultAddr, amount);
      await vault.deposit(await tokenA.getAddress(), amount);

      expect(await tokenA.balanceOf(vaultAddr)).to.equal(amount);
      expect(await feeRegistry.collectedFees(await tokenA.getAddress())).to.equal(0n);
    });

    it("deposit reverts for non-owner", async function () {
      const { vault, tokenA, other } = await deployWithFeeRegistryFixture();
      await expect(
        vault.connect(other).deposit(await tokenA.getAddress(), 1n),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("withdraw sends (amount - fee) to recipient and fee to FeeRegistry", async function () {
      const { vault, feeRegistry, tokenA, owner, recipient } = await deployWithFeeRegistryFixture();
      const vaultAddr = await vault.getAddress();
      const amount = ethers.parseEther("1000");

      await tokenA.transfer(vaultAddr, amount);

      const withdrawAmount = ethers.parseEther("200");
      const fee = withdrawAmount * 50n / 10_000n; // 0.5%

      await expect(vault.withdraw(await tokenA.getAddress(), withdrawAmount, recipient.address))
        .to.emit(vault, "Withdrawn")
        .withArgs(await tokenA.getAddress(), withdrawAmount, fee, recipient.address);

      expect(await tokenA.balanceOf(recipient.address)).to.equal(withdrawAmount - fee);
      expect(await feeRegistry.collectedFees(await tokenA.getAddress())).to.equal(fee);
      expect(await tokenA.balanceOf(vaultAddr)).to.equal(amount - withdrawAmount);
    });

    it("withdraw with feeBps=0 sends full amount", async function () {
      const { vault, feeRegistry, tokenA, recipient } = await deployWithFeeRegistryFixture();
      await feeRegistry.setWithdrawFeeBps(0);

      const vaultAddr = await vault.getAddress();
      const amount = ethers.parseEther("500");
      await tokenA.transfer(vaultAddr, amount);

      await vault.withdraw(await tokenA.getAddress(), amount, recipient.address);
      expect(await tokenA.balanceOf(recipient.address)).to.equal(amount);
    });

    it("withdraw reverts for non-owner", async function () {
      const { vault, tokenA, other, recipient } = await deployWithFeeRegistryFixture();
      await expect(
        vault.connect(other).withdraw(await tokenA.getAddress(), 1n, recipient.address),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("withdraw reverts for zero recipient", async function () {
      const { vault, tokenA } = await deployWithFeeRegistryFixture();
      const vaultAddr = await vault.getAddress();
      await tokenA.transfer(vaultAddr, ethers.parseEther("100"));

      await expect(
        vault.withdraw(await tokenA.getAddress(), 1n, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(vault, "ZeroRecipient");
    });
  });

  // ── FeeRegistry simplified ──────────────────────────────────────────────

  describe("FeeRegistry", function () {
    it("setDepositFeeBps / setWithdrawFeeBps owner-only and emits event", async function () {
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      const [, other] = await ethers.getSigners();

      await expect(feeRegistry.setDepositFeeBps(50))
        .to.emit(feeRegistry, "DepositFeeBpsSet")
        .withArgs(50);
      expect(await feeRegistry.depositFeeBps()).to.equal(50);

      await expect(feeRegistry.setWithdrawFeeBps(30))
        .to.emit(feeRegistry, "WithdrawFeeBpsSet")
        .withArgs(30);
      expect(await feeRegistry.withdrawFeeBps()).to.equal(30);

      await expect(
        feeRegistry.connect(other).setDepositFeeBps(10),
      ).to.be.revertedWithCustomError(feeRegistry, "OwnableUnauthorizedAccount");
    });

    it("setDepositFeeBps reverts when > MAX_FEE_BPS", async function () {
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await expect(feeRegistry.setDepositFeeBps(1001))
        .to.be.revertedWithCustomError(feeRegistry, "FeeTooHigh");
    });

    it("collectFee pulls tokens and accumulates collectedFees", async function () {
      const [owner] = await ethers.getSigners();
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("T", "T", ethers.parseEther("10000"));

      await feeRegistry.addAcceptedToken(await token.getAddress(), 18);
      const amount = ethers.parseEther("100");
      await token.approve(await feeRegistry.getAddress(), amount);

      await expect(feeRegistry.collectFee(await token.getAddress(), amount))
        .to.emit(feeRegistry, "FeeCollected")
        .withArgs(owner.address, await token.getAddress(), amount);

      expect(await feeRegistry.collectedFees(await token.getAddress())).to.equal(amount);
    });

    it("withdrawFees sends collected fees to owner", async function () {
      const [owner] = await ethers.getSigners();
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("T", "T", ethers.parseEther("10000"));

      await feeRegistry.addAcceptedToken(await token.getAddress(), 18);
      const amount = ethers.parseEther("50");
      await token.approve(await feeRegistry.getAddress(), amount);
      await feeRegistry.collectFee(await token.getAddress(), amount);

      const balBefore = await token.balanceOf(owner.address);

      await expect(feeRegistry.withdrawFees(await token.getAddress()))
        .to.emit(feeRegistry, "FeesWithdrawn")
        .withArgs(await token.getAddress(), amount);

      expect(await token.balanceOf(owner.address)).to.equal(balBefore + amount);
      expect(await feeRegistry.collectedFees(await token.getAddress())).to.equal(0n);
    });

    it("withdrawFees reverts when nothing to withdraw", async function () {
      const feeRegistry = await ethers.deployContract("FeeRegistry");
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("T", "T", ethers.parseEther("100"));

      await expect(
        feeRegistry.withdrawFees(await token.getAddress()),
      ).to.be.revertedWithCustomError(feeRegistry, "NothingToWithdraw");
    });
  });

  // ── ERC20TransferAction with withdraw fee ───────────────────────────────

  describe("ERC20TransferAction with fee", function () {
    async function deployTransferWithFeeFixture() {
      const [owner, executor, recipient] = await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy("TokenA", "TKA", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await tokenA.getAddress(), 18);
      await feeRegistry.setWithdrawFeeBps(100); // 1%

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());

      await factory.createVault(owner.address, await tokenA.getAddress(), ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const action    = await ethers.deployContract("ERC20TransferAction");

      return { vault, factory, feeRegistry, tokenA, condition, action, owner, executor, recipient };
    }

    it("deducts withdraw fee from transfer amount in automation", async function () {
      const { vault, feeRegistry, tokenA, condition, action, executor, recipient } =
        await deployTransferWithFeeFixture();

      const vaultAddr = await vault.getAddress();
      const regAddr = await feeRegistry.getAddress();
      const transferAmount = ethers.parseEther("1000");
      const fee = transferAmount * 100n / 10_000n; // 1%

      await tokenA.transfer(vaultAddr, transferAmount);

      const triggerData = encodeBalanceParams(await tokenA.getAddress(), vaultAddr, 1n, true);
      const actionData  = encodeTransferParams(
        await tokenA.getAddress(),
        recipient.address,
        transferAmount,
        NO_SLOT,
        NO_SLOT,
        regAddr,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      await vault.connect(executor).executeAutomation(0);

      expect(await tokenA.balanceOf(recipient.address)).to.equal(transferAmount - fee);
      expect(await feeRegistry.collectedFees(await tokenA.getAddress())).to.equal(fee);
    });

    it("no fee when feeRegistry=address(0) in action params", async function () {
      const { vault, tokenA, condition, action, executor, recipient } =
        await deployTransferWithFeeFixture();

      const vaultAddr = await vault.getAddress();
      const transferAmount = ethers.parseEther("100");
      await tokenA.transfer(vaultAddr, transferAmount);

      const triggerData = encodeBalanceParams(await tokenA.getAddress(), vaultAddr, 1n, true);
      const actionData  = encodeTransferParams(
        await tokenA.getAddress(),
        recipient.address,
        transferAmount,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      await vault.connect(executor).executeAutomation(0);

      expect(await tokenA.balanceOf(recipient.address)).to.equal(transferAmount);
    });

    it("fee collected by FeeRegistry is withdrawable by owner", async function () {
      const { vault, feeRegistry, tokenA, condition, action, executor, recipient } =
        await deployTransferWithFeeFixture();

      const vaultAddr = await vault.getAddress();
      const regAddr   = await feeRegistry.getAddress();
      const transferAmount = ethers.parseEther("500");
      const fee = transferAmount * 100n / 10_000n;

      await tokenA.transfer(vaultAddr, transferAmount);

      const triggerData = encodeBalanceParams(await tokenA.getAddress(), vaultAddr, 1n, true);
      const actionData  = encodeTransferParams(
        await tokenA.getAddress(),
        recipient.address,
        transferAmount,
        NO_SLOT,
        NO_SLOT,
        regAddr,
      );

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);
      await vault.connect(executor).executeAutomation(0);

      const [registryOwner] = await ethers.getSigners();
      const balBefore = await tokenA.balanceOf(registryOwner.address);
      await feeRegistry.withdrawFees(await tokenA.getAddress());
      expect(await tokenA.balanceOf(registryOwner.address)).to.equal(balBefore + fee);
    });
  });

  // ── IntervalCondition ───────────────────────────────────────────────────

  describe("IntervalCondition", function () {
    const INTERVAL = 300n;
    const TIME_SLOT = 0;

    async function deployIntervalFixture() {
      const [owner, executor] = await ethers.getSigners();

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

      const condition = await ethers.deployContract("IntervalCondition");

      return { vault, condition, owner, executor };
    }

    it("check returns false when context slot is empty", async function () {
      const { condition } = await deployIntervalFixture();
      const ctx = ["0x"];
      const met = await condition.check(encodeIntervalParams(INTERVAL, TIME_SLOT), ctx);
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
      const futureTime = BigInt(latest!.timestamp) + 3600n;
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
      expect(newNextTime).to.equal(startTime + INTERVAL);
    });

    it("full automation: condition fires, interval advances, condition blocks until next window", async function () {
      const { vault, condition, owner, executor } = await deployIntervalFixture();

      const latest = await ethers.provider.getBlock("latest");
      const startTime = BigInt(latest!.timestamp);

      await vault.connect(owner).setContext([abiCoder.encode(["uint256"], [startTime])]);

      const params = encodeIntervalParams(INTERVAL, TIME_SLOT);
      await vault.connect(owner).createAutomation([
        conditionStep(await condition.getAddress(), params, DONE, DONE, CHECK_SEL),
      ]);

      await vault.connect(executor).executeAutomation(0);

      const ctxAfter = await vault.getContext();
      const nextTime: bigint = abiCoder.decode(["uint256"], ctxAfter[0])[0] as bigint;
      expect(nextTime).to.equal(startTime + INTERVAL);

      await expect(vault.connect(executor).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "TriggerNotMet");

      await ethers.provider.send("evm_increaseTime", [Number(INTERVAL)]);
      await ethers.provider.send("evm_mine", []);

      await vault.connect(executor).executeAutomation(0);
      const ctxFinal = await vault.getContext();
      const nextTimeFinal: bigint = abiCoder.decode(["uint256"], ctxFinal[0])[0] as bigint;
      expect(nextTimeFinal).to.equal(startTime + INTERVAL * 2n);
    });

    it("non-updatable trigger condition: context unchanged after execution", async function () {
      const { vault, owner, executor } = await deployIntervalFixture();
      const condition = await ethers.deployContract("TokenBalanceCondition");
      const MockToken = await ethers.getContractFactory("MockERC20");
      const token = await MockToken.deploy("T", "T", ethers.parseEther("1000"));
      const vaultAddress = await vault.getAddress();
      await token.transfer(vaultAddress, ethers.parseEther("1"));

      const sentinel = 9999999999n;
      await vault.connect(owner).setContext([abiCoder.encode(["uint256"], [sentinel])]);

      const triggerData = encodeBalanceParams(await token.getAddress(), vaultAddress, 1n, true);
      await vault.connect(owner).createAutomation([
        conditionStep(await condition.getAddress(), triggerData, DONE, DONE, CHECK_SEL),
      ]);
      await vault.connect(executor).executeAutomation(0);

      const ctxAfter = await vault.getContext();
      const val: bigint = abiCoder.decode(["uint256"], ctxAfter[0])[0] as bigint;
      expect(val).to.equal(sentinel);
    });

    it("reverts with ZeroInterval when interval is 0", async function () {
      const { condition } = await deployIntervalFixture();
      const ctx = [abiCoder.encode(["uint256"], [1000000n])];
      await expect(
        condition.afterExecution(encodeIntervalParams(0n, TIME_SLOT), ctx),
      ).to.be.revertedWithCustomError(condition, "ZeroInterval");
    });

    it("reverts with SlotOutOfBounds when timeSlot is out of range", async function () {
      const { condition } = await deployIntervalFixture();
      await expect(
        condition.check(encodeIntervalParams(INTERVAL, 0), []),
      ).to.be.revertedWithCustomError(condition, "SlotOutOfBounds");
    });
  });

  // ── TimerCondition ───────────────────────────────────────────────────────

  describe("TimerCondition", function () {
    const DELTA = 300n;
    const TIME_SLOT = 0;

    async function deployTimerFixture() {
      const [owner, executor] = await ethers.getSigners();

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));
      const condition = await ethers.deployContract("TimerCondition");

      return { vault, condition, owner, executor };
    }

    it("check returns false when slot is empty", async function () {
      const { condition } = await deployTimerFixture();
      expect(await condition.check(encodeTimerParams(DELTA, TIME_SLOT), ["0x"])).to.equal(false);
    });

    it("check returns false when startTime is 0", async function () {
      const { condition } = await deployTimerFixture();
      const ctx = [abiCoder.encode(["uint256"], [0n])];
      expect(await condition.check(encodeTimerParams(DELTA, TIME_SLOT), ctx)).to.equal(false);
    });

    it("check returns false before delta elapsed", async function () {
      const { condition } = await deployTimerFixture();
      const latest = await ethers.provider.getBlock("latest");
      const ctx = [abiCoder.encode(["uint256"], [BigInt(latest!.timestamp)])];
      expect(await condition.check(encodeTimerParams(DELTA, TIME_SLOT), ctx)).to.equal(false);
    });

    it("check returns true after delta elapsed", async function () {
      const { condition } = await deployTimerFixture();
      const latest = await ethers.provider.getBlock("latest");
      const ctx = [abiCoder.encode(["uint256"], [BigInt(latest!.timestamp) - DELTA - 1n])];
      expect(await condition.check(encodeTimerParams(DELTA, TIME_SLOT), ctx)).to.equal(true);
    });

    it("afterExecution resets slot to 0", async function () {
      const { condition } = await deployTimerFixture();
      const latest = await ethers.provider.getBlock("latest");
      const ctx = [abiCoder.encode(["uint256"], [BigInt(latest!.timestamp) - DELTA - 1n])];
      const [slots, values] = await condition.afterExecution(encodeTimerParams(DELTA, TIME_SLOT), ctx);
      expect(abiCoder.decode(["uint256"], values[0])[0]).to.equal(0n);
    });

    it("full automation: timer fires once then stops", async function () {
      const { vault, condition, owner, executor } = await deployTimerFixture();

      const latest = await ethers.provider.getBlock("latest");
      await vault.connect(owner).setContext([abiCoder.encode(["uint256"], [BigInt(latest!.timestamp)])]);

      await vault.connect(owner).createAutomation([
        conditionStep(await condition.getAddress(), encodeTimerParams(DELTA, TIME_SLOT), DONE, DONE, CHECK_SEL),
      ]);

      await expect(vault.connect(executor).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "TriggerNotMet");

      await ethers.provider.send("evm_increaseTime", [Number(DELTA)]);
      await ethers.provider.send("evm_mine", []);

      await vault.connect(executor).executeAutomation(0);
      let ctx = await vault.getContext();
      expect(abiCoder.decode(["uint256"], ctx[0])[0]).to.equal(0n);

      await expect(vault.connect(executor).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "TriggerNotMet");
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
      await vault.setContext([enc("uint256", 0n)]);

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(),
        vaultAddress,
        1n,
        true,
      );
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
    async function deployFeeDepositFixture() {
      const [owner, executor] = await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const feeToken = await MockToken.deploy("FEE", "FEE", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await feeToken.getAddress(), 18);

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.createVault(owner.address, await feeToken.getAddress(), ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

      const condition       = await ethers.deployContract("TokenBalanceCondition");
      const feeDepositAction = await ethers.deployContract("FeeDepositAction");

      return { vault, feeRegistry, feeToken, condition, feeDepositAction, owner, executor };
    }

    it("tops up vault deposit when below minimum", async function () {
      const { vault, feeRegistry, feeToken, condition, feeDepositAction, owner, executor } =
        await deployFeeDepositFixture();

      const vaultAddr = await vault.getAddress();
      const regAddr   = await feeRegistry.getAddress();

      await vault.setMinFeeDeposit(ethers.parseEther("100"));
      await feeToken.transfer(vaultAddr, ethers.parseEther("200"));

      const triggerData = encodeBalanceParams(
        await feeToken.getAddress(), vaultAddr, 1n, true,
      );
      const feeDepositData = encodeFeeDepositParams(regAddr, await feeToken.getAddress());

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await feeDepositAction.getAddress(), feeDepositData),
      ]);

      await vault.connect(executor).executeAutomation(0);

      expect(await feeRegistry.vaultDeposit(vaultAddr, await feeToken.getAddress()))
        .to.equal(ethers.parseEther("100"));
    });

    it("no-op when deposit already meets minimum", async function () {
      const { vault, feeRegistry, feeToken, condition, feeDepositAction, owner, executor } =
        await deployFeeDepositFixture();

      const vaultAddr = await vault.getAddress();
      const regAddr   = await feeRegistry.getAddress();

      await vault.setMinFeeDeposit(ethers.parseEther("50"));
      await feeToken.transfer(vaultAddr, ethers.parseEther("200"));

      // Pre-fund to minimum
      await feeToken.approve(regAddr, ethers.parseEther("100"));
      await feeRegistry.depositFor(vaultAddr, await feeToken.getAddress(), ethers.parseEther("100"));

      const triggerData = encodeBalanceParams(
        await feeToken.getAddress(), vaultAddr, 1n, true,
      );
      const feeDepositData = encodeFeeDepositParams(regAddr, await feeToken.getAddress());

      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await feeDepositAction.getAddress(), feeDepositData),
      ]);

      const depositBefore = await feeRegistry.vaultDeposit(vaultAddr, await feeToken.getAddress());
      await vault.connect(executor).executeAutomation(0);
      const depositAfter = await feeRegistry.vaultDeposit(vaultAddr, await feeToken.getAddress());

      expect(depositAfter).to.equal(depositBefore);
    });
  });

  // ── Gas compensation ────────────────────────────────────────────────────

  describe("gas compensation", function () {
    async function deployGasCompFixture() {
      const [owner, executor] = await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const feeToken = await MockToken.deploy("FEE", "FEE", ethers.parseEther("1000000"));
      const tokenA   = await MockToken.deploy("TKA", "TKA", ethers.parseEther("1000000"));

      const feeRegistry = await ethers.deployContract("FeeRegistry");
      await feeRegistry.addAcceptedToken(await feeToken.getAddress(), 18);

      const oracle = await ethers.deployContract("MockPriceOracle");
      await oracle.setPrice(await feeToken.getAddress(), ethers.parseEther("1"));  // $1
      // BNB price for gas comp
      await oracle.setPrice(ethers.ZeroAddress, ethers.parseEther("300"));

      await feeRegistry.setGasConfig(
        await oracle.getAddress(),
        ethers.ZeroAddress,
        2000,    // 20% executor markup
        100_000, // overhead
        0,       // no gas price cap
      );

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());
      await factory.setFeeRegistry(await feeRegistry.getAddress());
      await factory.createVault(owner.address, await feeToken.getAddress(), ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

      // Pre-fund vault's gas comp deposit
      const depositAmount = ethers.parseEther("1000");
      await feeToken.approve(await feeRegistry.getAddress(), depositAmount);
      await feeRegistry.depositFor(await vault.getAddress(), await feeToken.getAddress(), depositAmount);

      const condition = await ethers.deployContract("TokenBalanceCondition");
      const action    = await ethers.deployContract("ERC20TransferAction");

      return { vault, feeRegistry, feeToken, tokenA, oracle, condition, action, owner, executor };
    }

    it("executor receives gas compensation from vault deposit", async function () {
      const { vault, feeRegistry, feeToken, tokenA, condition, action, executor } =
        await deployGasCompFixture();

      const vaultAddr = await vault.getAddress();
      await tokenA.transfer(vaultAddr, ethers.parseEther("10"));

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(), vaultAddr, 1n, true,
      );
      const actionData = encodeTransferParams(
        await tokenA.getAddress(), executor.address, ethers.parseEther("1"),
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      const depositBefore = await feeRegistry.vaultDeposit(vaultAddr, await feeToken.getAddress());
      const executorBalBefore = await feeToken.balanceOf(executor.address);

      await vault.connect(executor).executeAutomation(0);

      const depositAfter = await feeRegistry.vaultDeposit(vaultAddr, await feeToken.getAddress());
      const executorBalAfter = await feeToken.balanceOf(executor.address);

      // Deposit decreased
      expect(depositAfter).to.be.lessThan(depositBefore);
      // Executor received gas comp directly (push, not pull)
      const gasComp = executorBalAfter - executorBalBefore;
      expect(gasComp).to.be.greaterThan(0n);
      expect(depositBefore - depositAfter).to.equal(gasComp);
    });

    it("owner pays no gas compensation", async function () {
      const { vault, feeRegistry, feeToken, tokenA, condition, action } =
        await deployGasCompFixture();

      const vaultAddr = await vault.getAddress();
      await tokenA.transfer(vaultAddr, ethers.parseEther("10"));

      const triggerData = encodeBalanceParams(
        await tokenA.getAddress(), vaultAddr, 1n, true,
      );
      const actionData = encodeTransferParams(
        await tokenA.getAddress(), (await ethers.getSigners())[2].address, ethers.parseEther("1"),
      );
      await vault.createAutomation([
        conditionStep(await condition.getAddress(), triggerData, 1, DONE),
        actionStep(await action.getAddress(), actionData),
      ]);

      const depositBefore = await feeRegistry.vaultDeposit(vaultAddr, await feeToken.getAddress());

      // Owner executes — no gas comp
      await vault.executeAutomation(0);

      const depositAfter = await feeRegistry.vaultDeposit(vaultAddr, await feeToken.getAddress());
      expect(depositAfter).to.equal(depositBefore);
    });

    it("estimateGasComp returns estimate for off-chain callers", async function () {
      const { feeRegistry, feeToken } = await deployGasCompFixture();
      const estimate = await feeRegistry.estimateGasComp(
        await feeToken.getAddress(),
        200_000n,
        3_000_000_000n, // 3 gwei
      );
      expect(estimate).to.be.greaterThan(0n);
    });
  });

  // ── Owner-only automations ──────────────────────────────────────────────

  describe("createOwnerAutomation / owner-only execution", function () {
    async function deployOwnerAutomationFixture() {
      const [owner, other] = await ethers.getSigners();

      const MockToken = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockToken.deploy("TokenA", "TKA", ethers.parseEther("1000000"));

      const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
      const factory   = await ethers.deployContract("StrategyBuilderVaultFactory");
      await factory.setVaultImplementation(await vaultImpl.getAddress());

      await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
      const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

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

    it("createAutomation (public) rejects step 0 as ACTION", async function () {
      const { vault, tokenA, action } = await deployOwnerAutomationFixture();

      await expect(vault.createAutomation([
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), ethers.ZeroAddress, 0n),
        ),
      ])).to.be.revertedWithCustomError(vault, "FirstStepMustBeCondition");
    });

    it("non-owner cannot execute an owner-only automation", async function () {
      const { vault, tokenA, action, owner, other } = await deployOwnerAutomationFixture();

      await tokenA.transfer(await vault.getAddress(), ethers.parseEther("10"));
      await vault.createOwnerAutomation([
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), owner.address, ethers.parseEther("1")),
        ),
      ]);

      await expect(vault.connect(other).executeAutomation(0))
        .to.be.revertedWithCustomError(vault, "CallerNotOwner");
    });

    it("owner can execute and actions run", async function () {
      const { vault, tokenA, action, owner } = await deployOwnerAutomationFixture();

      const vaultAddress = await vault.getAddress();
      await tokenA.transfer(vaultAddress, ethers.parseEther("10"));

      await vault.createOwnerAutomation([
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), owner.address, ethers.parseEther("3")),
        ),
      ]);

      const balBefore = await tokenA.balanceOf(owner.address);
      await vault.executeAutomation(0);
      const balAfter = await tokenA.balanceOf(owner.address);

      expect(balAfter - balBefore).to.equal(ethers.parseEther("3"));
    });

    it("isTriggerMet returns true for owner-only automation with ACTION at step 0", async function () {
      const { vault, tokenA, action, owner } = await deployOwnerAutomationFixture();

      await vault.createOwnerAutomation([
        actionStep(
          await action.getAddress(),
          encodeTransferParams(await tokenA.getAddress(), owner.address, ethers.parseEther("1")),
        ),
      ]);

      expect(await vault.isTriggerMet(0)).to.be.true;
    });
  });
});
