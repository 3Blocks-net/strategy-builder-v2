import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder } from "ethers";

const { ethers } = await network.connect();

const abiCoder = AbiCoder.defaultAbiCoder();
const enc = (type: string, value: unknown) => abiCoder.encode([type], [value]);
const NO_SLOT = 0xffffffff;

// Isolated Solidity unit tests for ActionLib v1 — amount-resolution primitives
// and slot I/O. The three ERC-20 amount conventions are exercised separately so
// it is provable they cannot leak between actions (see PRD §ActionLib).
describe("ActionLib", function () {
  async function fixture() {
    const harness = await ethers.deployContract("ActionLibHarness");
    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.deploy("Tok", "TOK", ethers.parseEther("1000"));
    return { harness, token };
  }

  describe("readUint256Slot", function () {
    it("decodes a uint256 from the given slot", async function () {
      const { harness } = await fixture();
      const ctx = [enc("uint256", 111n), enc("uint256", 222n)];
      expect(await harness.readUint256Slot(ctx, 0)).to.equal(111n);
      expect(await harness.readUint256Slot(ctx, 1)).to.equal(222n);
    });

    it("reverts when the slot index is out of bounds", async function () {
      const { harness } = await fixture();
      const ctx = [enc("uint256", 5n)];
      await expect(harness.readUint256Slot(ctx, 1))
        .to.be.revertedWithCustomError(harness, "SlotOutOfBounds")
        .withArgs(1);
    });

    it("reverts on an empty context", async function () {
      const { harness } = await fixture();
      await expect(harness.readUint256Slot([], 0))
        .to.be.revertedWithCustomError(harness, "SlotOutOfBounds")
        .withArgs(0);
    });
  });

  describe("fullBalance", function () {
    it("returns the ERC-20 balance of the caller (address(this))", async function () {
      const { harness, token } = await fixture();
      const amount = ethers.parseEther("42");
      await token.transfer(await harness.getAddress(), amount);
      expect(await harness.fullBalance(await token.getAddress())).to.equal(amount);
    });

    it("returns zero when the caller holds none", async function () {
      const { harness, token } = await fixture();
      expect(await harness.fullBalance(await token.getAddress())).to.equal(0n);
    });
  });

  describe("singleSlotDiff", function () {
    it("builds a one-entry diff for a real slot", async function () {
      const { harness } = await fixture();
      const [slots, values] = await harness.singleSlotDiff(3, 777n);
      expect(slots).to.deep.equal([3n]);
      expect(values.length).to.equal(1);
      expect(abiCoder.decode(["uint256"], values[0])[0]).to.equal(777n);
    });

    it("returns empty arrays when slot == NO_SLOT", async function () {
      const { harness } = await fixture();
      const [slots, values] = await harness.singleSlotDiff(NO_SLOT, 777n);
      expect(slots.length).to.equal(0);
      expect(values.length).to.equal(0);
    });
  });

  it("exposes NO_SLOT as type(uint32).max", async function () {
    const { harness } = await fixture();
    expect(await harness.NO_SLOT()).to.equal(NO_SLOT);
  });
});
