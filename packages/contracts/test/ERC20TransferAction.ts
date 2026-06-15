import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder, id } from "ethers";

const { ethers } = await network.connect();

// ── Regression coverage for ERC20TransferAction (PRD User Stories 1–4) ───────
// Locks in the existing transfer behavior as the new DeFi actions, ActionLib,
// and the per-protocol token infrastructure land alongside it. No new contract.

const abiCoder = AbiCoder.defaultAbiCoder();
const enc = (type: string, value: unknown) => abiCoder.encode([type], [value]);
const EXECUTE_SEL = id("execute(bytes,bytes[])").slice(0, 10);
const DONE = 0xffffffff;
const NO_SLOT = 0xffffffff;

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

function actionStep(target: string, data: string) {
  return { stepType: 1, target, selector: EXECUTE_SEL, nextOnTrue: DONE, nextOnFalse: DONE, data };
}

describe("ERC20TransferAction (regression)", function () {
  async function fixture() {
    const [owner, recipient] = await ethers.getSigners();

    const vaultImpl = await ethers.deployContract("StrategyBuilderVault");
    const factory = await ethers.deployContract("StrategyBuilderVaultFactory");
    await factory.setVaultImplementation(await vaultImpl.getAddress());
    await factory.createVault(owner.address, ethers.ZeroAddress, ethers.ZeroHash);
    const vault = await ethers.getContractAt("StrategyBuilderVault", await factory.getVault(0));

    const action = await ethers.deployContract("ERC20TransferAction");
    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.deploy("Tok", "TOK", ethers.parseEther("1000000"));

    return { owner, recipient, vault, action, token };
  }

  // US #1 — transfer a fixed amount from the vault to an address.
  it("transfers a fixed amount to the recipient", async function () {
    const { recipient, vault, action, token } = await fixture();
    await token.transfer(await vault.getAddress(), ethers.parseEther("100"));

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeTransferParams(await token.getAddress(), recipient.address, ethers.parseEther("40")),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("40"));
    expect(await token.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("60"));
  });

  // US #2 — optionally deduct the protocol withdraw fee (dynamic withdrawFeeBps).
  it("deducts the withdraw fee when feeRegistry is set", async function () {
    const { recipient, vault, action, token } = await fixture();
    const feeRegistry = await ethers.deployContract("FeeRegistry");
    await feeRegistry.setWithdrawFeeBps(50); // 0.5%
    await token.transfer(await vault.getAddress(), ethers.parseEther("100"));

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeTransferParams(
          await token.getAddress(),
          recipient.address,
          ethers.parseEther("100"),
          NO_SLOT,
          NO_SLOT,
          await feeRegistry.getAddress(),
        ),
      ),
    ]);
    await vault.executeAutomation(0);

    // fee = 100 * 0.5% = 0.5; recipient gets 99.5; FeeRegistry collects 0.5.
    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("99.5"));
    expect(await feeRegistry.collectedFees(await token.getAddress())).to.equal(ethers.parseEther("0.5"));
    // approval to FeeRegistry is consumed exactly by collectFee.
    expect(await token.allowance(await vault.getAddress(), await feeRegistry.getAddress())).to.equal(0n);
  });

  it("skips the fee when feeRegistry is the zero address", async function () {
    const { recipient, vault, action, token } = await fixture();
    await token.transfer(await vault.getAddress(), ethers.parseEther("10"));

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeTransferParams(await token.getAddress(), recipient.address, ethers.parseEther("10")),
      ),
    ]);
    await vault.executeAutomation(0);

    // No fee deducted — recipient gets the full amount.
    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("10"));
  });

  // US #3 — transfer the full vault balance via the zero-toggle (amount = 0).
  it("transfers the full vault balance when amount = 0", async function () {
    const { recipient, vault, action, token } = await fixture();
    await token.transfer(await vault.getAddress(), ethers.parseEther("73"));

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeTransferParams(await token.getAddress(), recipient.address, 0n),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("73"));
    expect(await token.balanceOf(await vault.getAddress())).to.equal(0n);
  });

  // US #4 — source the transfer amount from a context slot (a previous step's output).
  it("reads the transfer amount from a context slot", async function () {
    const { recipient, vault, action, token } = await fixture();
    await token.transfer(await vault.getAddress(), ethers.parseEther("100"));
    await vault.setContext([enc("uint256", ethers.parseEther("25"))]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeTransferParams(await token.getAddress(), recipient.address, 0n, 0),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("25"));
  });

  it("writes the actual transferred amount to a context slot", async function () {
    const { recipient, vault, action, token } = await fixture();
    await token.transfer(await vault.getAddress(), ethers.parseEther("100"));
    await vault.setContext([enc("uint256", 0n)]);

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeTransferParams(await token.getAddress(), recipient.address, ethers.parseEther("30"), NO_SLOT, 0),
      ),
    ]);
    await vault.executeAutomation(0);

    expect(abiCoder.decode(["uint256"], (await vault.getContext())[0])[0]).to.equal(ethers.parseEther("30"));
  });

  it("reverts on a zero token / recipient", async function () {
    const { recipient, vault, action, token } = await fixture();
    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeTransferParams(ethers.ZeroAddress, recipient.address, 1n),
      ),
    ]);
    await expect(vault.executeAutomation(0)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");

    await vault.createOwnerAutomation([
      actionStep(
        await action.getAddress(),
        encodeTransferParams(await token.getAddress(), ethers.ZeroAddress, 1n),
      ),
    ]);
    await expect(vault.executeAutomation(1)).to.be.revertedWithCustomError(vault, "ActionExecutionFailed");
  });
});
